# TreatyTribunal (GenLayer)

The GenLayer half of Agent Diplomacy. Escrow stays on Rialo; this contract only decides disputes and records each verdict under the
case id the caller chose, so two disputes filed at the same moment never read each other's verdict.

`adjudicate(case_id, kind, terms, defendant_role, allegation, evidence_uri, evidence_hash, service_record)`:

1. Deterministic gates: unique case id, known treaty kind and role, non-empty allegation, well-formed service record.
2. Objective metric: for a service provider, `failed * 10000 / calls` once it has served 3+ calls; `0` for the hiring party;
   none for other kinds.
3. Non-deterministic round: the evidence document is fetched (SSRF-guarded, 2xx only, must hash to `evidence_hash`), the
   tag-isolated tribunal prompt runs, and the verdict is clamped to the band the metric supports.
4. `prompt_comparative` equivalence: validators must agree on the same tier and a rationale that supports it.

The adjudication design, the SSRF guard and the evidence reader come from Westphalia by moltaphet (MIT, see
[`WESTPHALIA_LICENSE`](WESTPHALIA_LICENSE)).

## Test

Python 3.12 and the GenLayer pre-release toolchain (the same pins Westphalia uses):

```bash
uv venv --python 3.12 && source .venv/bin/activate
uv pip install --prerelease=allow genlayer-test==0.30.0rc2 genlayer-py==0.19.0rc2 pytest web3==8.0.0 eth-account==0.14.0
pytest tests -q        # 15 direct-mode tests
```

Direct mode runs the leader with mocked web reads and model answers. Validator agreement needs a live network.

## Deploy

Deploy `treaty_tribunal.py` to GenLayer Studio (the constructor takes no arguments), for example from
[studio.genlayer.com](https://studio.genlayer.com) or with the `genlayer` CLI:

```bash
genlayer deploy --contract contracts/genlayer/treaty_tribunal.py
```

Then set `GENLAYER_TRIBUNAL_ADDRESS` (and a funded `GENLAYER_PRIVATE_KEY`) in the frontend's environment.
