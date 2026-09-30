import type { Agent } from "@/context/AgentsContext";

// Real HTTP calls to an agent's registered endpoint, shared by the marketplace
// (a poster's task) and diplomacy (one agent using another under a treaty).

// Calls an agent's endpoint with the given input text as the task payload.
export async function callAgentEndpoint(agent: Pick<Agent, "endpoint">, inputText: string): Promise<string> {
  if (agent.endpoint.includes("api.mymemory.translated.net")) {
    const url = `${agent.endpoint}?q=${encodeURIComponent(inputText)}&langpair=en|tr`;
    const data = await fetchWithFallback(url);
    return data.responseData?.translatedText
      ? `Live agent response: "${data.responseData.translatedText}"`
      : "Agent responded but returned no translation.";
  }
  if (agent.endpoint.includes("api.coingecko.com")) {
    const data = await fetchWithFallback(agent.endpoint);
    const [assetId] = Object.keys(data);
    const prices = data[assetId];
    const [currency, value] = Object.entries(prices)[0] as [string, number];
    return `Live agent response: ${assetId.toUpperCase()} = ${value} ${currency.toUpperCase()}`;
  }
  const res = await fetch(agent.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: inputText, description: inputText }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return `Live agent response: ${text.slice(0, 300)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchWithFallback(url: string): Promise<any> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (directErr) {
    try {
      const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      const reason = directErr instanceof TypeError
        ? "network/browser blocked the request (check VPN, ad blocker, or firewall)"
        : (directErr as Error).message;
      throw new Error(reason);
    }
  }
}
