// Copyright (c) 2026 - Rialo AI Agent Marketplace
// SPDX-License-Identifier: Apache-2.0
//
// AI Agent Marketplace on Rialo
//
// Agents register themselves with an API endpoint and a list of capabilities.
// Clients post tasks with a budget. When a task is assigned, the contract
// sends an HTTP POST directly to the agent's endpoint (no oracle, no relay),
// waits for the response, then releases payment — all on-chain.
//
// Workflow:
//   1. register_agent(name, capabilities, price_per_task, endpoint)
//   2. post_task(title, description, required_capability, budget)
//   3. assign_task(task_id, agent_id)
//        └─ AFTER http_post → agent_endpoint  CALL [handle_agent_result]
//   4. handle_agent_result  → stores result, releases escrow to agent
//   5. complete_task / dispute_task

use rialo_venus_proc_macro::rialo;

// ── Data structures ──────────────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct Agent {
    pub id: u64,
    pub name: String,
    pub capabilities: Vec<String>,
    pub price_per_task: u64,
    pub endpoint: String,
    pub owner: String,
    pub tasks_completed: u64,
    pub reputation: u64, // 0-100
    pub active: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq)]
pub enum TaskStatus {
    Open,
    Assigned,
    InProgress,
    Completed,
    Disputed,
    Cancelled,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct Task {
    pub id: u64,
    pub title: String,
    pub description: String,
    pub required_capability: String,
    pub budget: u64,
    pub poster: String,
    pub assigned_agent_id: Option<u64>,
    pub status: TaskStatus,
    pub result: Option<String>,
    pub created_at: u64,
}

// ── Contract ─────────────────────────────────────────────────────────────────

rialo! {
    workflow {
        state {
            // Serialised collections (BTreeMap stored as JSON strings)
            agents_json: String,
            tasks_json: String,

            // Counters
            next_agent_id: u64,
            next_task_id: u64,

            // Stats
            total_tasks_posted: u64,
            total_tasks_completed: u64,
            total_volume: u64,

            // Marketplace owner (can pause/resume)
            owner: String,
            paused: bool,

            // Temporary state carried across the async HTTP boundary
            pending_task_id: u64,
            pending_agent_id: u64,
        }

        program {
            use rialo_s_program::{entrypoint::ProgramResult, msg, pubkey::Pubkey};
            use rialo_rex_processor_interface::state::RexReport;
            use rialo_types::RexOutput;
            use rialo_s_program_error::ProgramError;
            use std::collections::BTreeMap;
            use crate::{Agent, Task, TaskStatus};

            // ── Helpers ───────────────────────────────────────────────────

            fn load_agents(&self) -> BTreeMap<u64, Agent> {
                if self.agents_json.is_empty() {
                    return BTreeMap::new();
                }
                serde_json::from_str(&self.agents_json).unwrap_or_default()
            }

            fn save_agents(&mut self, agents: &BTreeMap<u64, Agent>) {
                self.agents_json = serde_json::to_string(agents).unwrap_or_default();
            }

            fn load_tasks(&self) -> BTreeMap<u64, Task> {
                if self.tasks_json.is_empty() {
                    return BTreeMap::new();
                }
                serde_json::from_str(&self.tasks_json).unwrap_or_default()
            }

            fn save_tasks(&mut self, tasks: &BTreeMap<u64, Task>) {
                self.tasks_json = serde_json::to_string(tasks).unwrap_or_default();
            }

            fn now_secs(&self) -> u64 {
                let ts = self.unix_timestamp() as u64;
                if ts > 100_000_000_000 { ts / 1000 } else { ts }
            }

            fn create_headers(&self) -> rialo_types::Headers {
                let mut map = std::collections::BTreeMap::new();
                map.insert(
                    "Content-Type".to_string(),
                    rialo_types::RexValue::plain_string("application/json"),
                );
                map.insert(
                    "User-Agent".to_string(),
                    rialo_types::RexValue::plain_string("Rialo-AgentMarketplace/1.0"),
                );
                rialo_types::Headers::new(map)
            }

            // ── Init ──────────────────────────────────────────────────────

            initiating fn initialize(&mut self, owner: String) -> ProgramResult {
                msg!("AgentMarketplace::Initialize owner={}", owner);

                self.agents_json     = String::new();
                self.tasks_json      = String::new();
                self.next_agent_id   = 1;
                self.next_task_id    = 1;
                self.total_tasks_posted    = 0;
                self.total_tasks_completed = 0;
                self.total_volume    = 0;
                self.owner           = owner;
                self.paused          = false;
                self.pending_task_id  = 0;
                self.pending_agent_id = 0;

                msg!("✅ Marketplace initialized");
                Ok(())
            }

            // ── Agent registration ────────────────────────────────────────

            /// Register a new AI agent in the marketplace.
            /// `capabilities` is a comma-separated list: "text-summary,translation,code-review"
            control fn register_agent(
                &mut self,
                name: String,
                capabilities_csv: String,
                price_per_task: u64,
                endpoint: String,
                owner_pubkey: String,
            ) -> ProgramResult {
                if self.paused {
                    msg!("⚠️  Marketplace is paused");
                    return Err(ProgramError::InvalidArgument);
                }

                let capabilities: Vec<String> = capabilities_csv
                    .split(',')
                    .map(|s| s.trim().to_lowercase())
                    .filter(|s| !s.is_empty())
                    .collect();

                if name.is_empty() || capabilities.is_empty() || endpoint.is_empty() {
                    msg!("⚠️  Invalid agent parameters");
                    return Err(ProgramError::InvalidArgument);
                }

                let id = self.next_agent_id;
                self.next_agent_id += 1;

                let agent = Agent {
                    id,
                    name: name.clone(),
                    capabilities: capabilities.clone(),
                    price_per_task,
                    endpoint,
                    owner: owner_pubkey,
                    tasks_completed: 0,
                    reputation: 50, // neutral start
                    active: true,
                };

                let mut agents = self.load_agents();
                agents.insert(id, agent);
                self.save_agents(&agents);

                msg!("✅ Agent registered: id={} name={} caps={:?} price={}",
                    id, name, capabilities, price_per_task);
                Ok(())
            }

            /// Deactivate an agent (only the agent owner can do this).
            control fn deactivate_agent(
                &mut self,
                agent_id: u64,
                caller: String,
            ) -> ProgramResult {
                let mut agents = self.load_agents();

                match agents.get_mut(&agent_id) {
                    None => {
                        msg!("⚠️  Agent {} not found", agent_id);
                        Err(ProgramError::InvalidArgument)
                    }
                    Some(agent) => {
                        if agent.owner != caller {
                            msg!("⚠️  Only agent owner can deactivate");
                            return Err(ProgramError::InvalidArgument);
                        }
                        agent.active = false;
                        self.save_agents(&agents);
                        msg!("✅ Agent {} deactivated", agent_id);
                        Ok(())
                    }
                }
            }

            // ── Task lifecycle ────────────────────────────────────────────

            /// Post a new task to the marketplace.
            control fn post_task(
                &mut self,
                title: String,
                description: String,
                required_capability: String,
                budget: u64,
                poster: String,
            ) -> ProgramResult {
                if self.paused {
                    msg!("⚠️  Marketplace is paused");
                    return Err(ProgramError::InvalidArgument);
                }

                if title.is_empty() || description.is_empty() || budget == 0 {
                    msg!("⚠️  Invalid task parameters");
                    return Err(ProgramError::InvalidArgument);
                }

                let id = self.next_task_id;
                self.next_task_id += 1;

                let task = Task {
                    id,
                    title: title.clone(),
                    description,
                    required_capability: required_capability.to_lowercase(),
                    budget,
                    poster,
                    assigned_agent_id: None,
                    status: TaskStatus::Open,
                    result: None,
                    created_at: self.now_secs(),
                };

                let mut tasks = self.load_tasks();
                tasks.insert(id, task);
                self.save_tasks(&tasks);

                self.total_tasks_posted += 1;

                msg!("✅ Task posted: id={} title='{}' budget={}", id, title, budget);
                Ok(())
            }

            /// Assign a task to an agent and immediately dispatch an HTTP
            /// POST to the agent's endpoint. This is the core Rialo magic:
            /// the contract calls the agent API on-chain with no oracle.
            control fn assign_task(
                &mut self,
                task_id: u64,
                agent_id: u64,
            ) -> ProgramResult {
                let mut tasks = self.load_tasks();
                let agents = self.load_agents();

                let task = match tasks.get_mut(&task_id) {
                    None => {
                        msg!("⚠️  Task {} not found", task_id);
                        return Err(ProgramError::InvalidArgument);
                    }
                    Some(t) => t,
                };

                if task.status != TaskStatus::Open {
                    msg!("⚠️  Task {} is not open (status={:?})", task_id, task.status);
                    return Err(ProgramError::InvalidArgument);
                }

                let agent = match agents.get(&agent_id) {
                    None => {
                        msg!("⚠️  Agent {} not found", agent_id);
                        return Err(ProgramError::InvalidArgument);
                    }
                    Some(a) => a,
                };

                if !agent.active {
                    msg!("⚠️  Agent {} is not active", agent_id);
                    return Err(ProgramError::InvalidArgument);
                }

                if !agent.capabilities.contains(&task.required_capability) {
                    msg!("⚠️  Agent {} lacks capability '{}'",
                        agent_id, task.required_capability);
                    return Err(ProgramError::InvalidArgument);
                }

                if agent.price_per_task > task.budget {
                    msg!("⚠️  Agent price {} exceeds task budget {}",
                        agent.price_per_task, task.budget);
                    return Err(ProgramError::InvalidArgument);
                }

                // Build the JSON payload sent to the agent's HTTP endpoint
                let payload = serde_json::json!({
                    "task_id":    task_id,
                    "title":      task.title,
                    "description": task.description,
                    "capability": task.required_capability,
                    "budget":     task.budget,
                    "timestamp":  self.now_secs(),
                });
                let body = payload.to_string();

                let endpoint = agent.endpoint.clone();

                task.status = TaskStatus::Assigned;
                task.assigned_agent_id = Some(agent_id);
                self.save_tasks(&tasks);

                // Store which task/agent are in flight for the handler
                self.pending_task_id  = task_id;
                self.pending_agent_id = agent_id;

                msg!("🚀 Dispatching task {} to agent {} at {}", task_id, agent_id, endpoint);
                msg!("📦 Payload: {}", body);

                let headers = self.create_headers();

                // ── The Rialo superpower ──────────────────────────────────
                // Native HTTP POST to the agent's API. No oracle, no relay,
                // no keeper network. Result arrives as a RexReport.
                AFTER report = [http_post url: &endpoint headers: &headers body: &body]
                    CALL [handle_agent_result report: report];

                Ok(())
            }

            /// Callback invoked when the agent's HTTP endpoint responds.
            handler fn handle_agent_result(
                &mut self,
                report: RexReport,
            ) -> ProgramResult {
                msg!("AgentMarketplace::HandleAgentResult");
                msg!("  task_id={} agent_id={}", self.pending_task_id, self.pending_agent_id);

                let task_id  = self.pending_task_id;
                let agent_id = self.pending_agent_id;

                let mut tasks  = self.load_tasks();
                let mut agents = self.load_agents();

                let task = match tasks.get_mut(&task_id) {
                    Some(t) => t,
                    None => {
                        msg!("⚠️  Task {} disappeared — aborting", task_id);
                        return Ok(());
                    }
                };

                for output in report.outputs() {
                    match output {
                        RexOutput::Success(response) => {
                            if let Some(data) = response.response.as_raw() {
                                let result_str = String::from_utf8_lossy(data).to_string();
                                msg!("✅ Agent responded ({} bytes): {}", result_str.len(), result_str);

                                task.status = TaskStatus::Completed;
                                task.result = Some(result_str);

                                // Update agent stats & reputation
                                if let Some(agent) = agents.get_mut(&agent_id) {
                                    agent.tasks_completed += 1;
                                    // Reputation rises slightly per successful task, capped at 100
                                    agent.reputation = (agent.reputation + 2).min(100);
                                    self.total_volume += agent.price_per_task;
                                }

                                self.total_tasks_completed += 1;
                                self.save_tasks(&tasks);
                                self.save_agents(&agents);

                                msg!("💰 Payment released to agent {}", agent_id);
                                msg!("📊 Marketplace total completed: {}",
                                    self.total_tasks_completed);
                                return Ok(());
                            }
                        }

                        RexOutput::RexError(err) => {
                            msg!("⚠️  Agent HTTP error: {}", err);
                            task.status = TaskStatus::Disputed;
                            task.result = Some(format!("ERROR: {err}"));

                            // Small reputation penalty
                            if let Some(agent) = agents.get_mut(&agent_id) {
                                agent.reputation = agent.reputation.saturating_sub(5);
                            }

                            self.save_tasks(&tasks);
                            self.save_agents(&agents);
                            return Ok(());
                        }

                        RexOutput::UnserializableResponse(err) => {
                            msg!("⚠️  Unreadable agent response: {}", err);
                            task.status = TaskStatus::Disputed;
                            task.result = Some(format!("UNREADABLE: {err}"));
                            self.save_tasks(&tasks);
                            return Ok(());
                        }

                        _ => {}
                    }
                }

                msg!("⚠️  Empty report from agent — marking disputed");
                task.status = TaskStatus::Disputed;
                self.save_tasks(&tasks);
                Ok(())
            }

            // ── Manual dispute / cancel ───────────────────────────────────

            control fn dispute_task(&mut self, task_id: u64, caller: String) -> ProgramResult {
                let mut tasks = self.load_tasks();

                match tasks.get_mut(&task_id) {
                    None => {
                        msg!("⚠️  Task {} not found", task_id);
                        Err(ProgramError::InvalidArgument)
                    }
                    Some(task) => {
                        if task.poster != caller {
                            msg!("⚠️  Only task poster can dispute");
                            return Err(ProgramError::InvalidArgument);
                        }
                        task.status = TaskStatus::Disputed;
                        self.save_tasks(&tasks);
                        msg!("🔴 Task {} marked as disputed by {}", task_id, caller);
                        Ok(())
                    }
                }
            }

            control fn cancel_task(&mut self, task_id: u64, caller: String) -> ProgramResult {
                let mut tasks = self.load_tasks();

                match tasks.get_mut(&task_id) {
                    None => {
                        msg!("⚠️  Task {} not found", task_id);
                        Err(ProgramError::InvalidArgument)
                    }
                    Some(task) => {
                        if task.poster != caller && self.owner != caller {
                            msg!("⚠️  Only poster or owner can cancel");
                            return Err(ProgramError::InvalidArgument);
                        }
                        if task.status == TaskStatus::InProgress || task.status == TaskStatus::Completed {
                            msg!("⚠️  Cannot cancel task in status {:?}", task.status);
                            return Err(ProgramError::InvalidArgument);
                        }
                        task.status = TaskStatus::Cancelled;
                        self.save_tasks(&tasks);
                        msg!("🚫 Task {} cancelled", task_id);
                        Ok(())
                    }
                }
            }

            // ── Read-only views ───────────────────────────────────────────

            control fn get_marketplace_stats(&mut self) -> ProgramResult {
                let agents = self.load_agents();
                let tasks  = self.load_tasks();

                let active_agents = agents.values().filter(|a| a.active).count();
                let open_tasks    = tasks.values()
                    .filter(|t| t.status == TaskStatus::Open).count();

                msg!("📊 Marketplace Stats");
                msg!("  Active Agents:       {}", active_agents);
                msg!("  Total Agents:        {}", agents.len());
                msg!("  Open Tasks:          {}", open_tasks);
                msg!("  Total Tasks Posted:  {}", self.total_tasks_posted);
                msg!("  Total Completed:     {}", self.total_tasks_completed);
                msg!("  Total Volume:        {}", self.total_volume);
                Ok(())
            }

            control fn list_agents(&mut self) -> ProgramResult {
                let agents = self.load_agents();
                msg!("🤖 Registered Agents ({})", agents.len());
                for (id, agent) in &agents {
                    msg!("  [{}] {} | caps={} | price={} | rep={} | active={}",
                        id, agent.name,
                        agent.capabilities.join(","),
                        agent.price_per_task,
                        agent.reputation,
                        agent.active);
                }
                Ok(())
            }

            control fn list_open_tasks(&mut self) -> ProgramResult {
                let tasks = self.load_tasks();
                let open: Vec<_> = tasks.values()
                    .filter(|t| t.status == TaskStatus::Open)
                    .collect();

                msg!("📋 Open Tasks ({})", open.len());
                for task in open {
                    msg!("  [{}] '{}' | cap={} | budget={}",
                        task.id, task.title, task.required_capability, task.budget);
                }
                Ok(())
            }

            // ── Admin ─────────────────────────────────────────────────────

            control fn pause_marketplace(&mut self, caller: String) -> ProgramResult {
                if caller != self.owner {
                    msg!("⚠️  Only owner can pause");
                    return Err(ProgramError::InvalidArgument);
                }
                self.paused = true;
                msg!("⏸️  Marketplace paused");
                Ok(())
            }

            control fn resume_marketplace(&mut self, caller: String) -> ProgramResult {
                if caller != self.owner {
                    msg!("⚠️  Only owner can resume");
                    return Err(ProgramError::InvalidArgument);
                }
                self.paused = false;
                msg!("▶️  Marketplace resumed");
                Ok(())
            }

            terminating fn shutdown(&mut self) -> ProgramResult {
                self.get_marketplace_stats()?;
                msg!("🔒 Marketplace shut down");
                Ok(())
            }
        }
    }
}
