# Grounded content evaluation

Run the versioned golden and adversarial set against the exact model configured for staging before enabling grounded content generation.

## Prerequisites

- AWS credentials that can read the configured OpenAI secret from Secrets Manager
- `AWS_REGION`
- `OPENAI_API_KEY_SECRET_REFERENCE`
- `OPENAI_GENERATION_MODEL` set to the staging model

The command resolves the API key through the production credential path. Do not place a plaintext API key in the environment or repository.

## Run

```powershell
pnpm verify:staging:grounded-content
```

The command exits nonzero if a model call fails, a production validator does not pass, required evidence is not cited, an adversarial phrase appears, or the fixture prompt version differs from the production prompt version.

Archive the JSON report with the release evidence. It records the dataset version and checksum, prompt version, model, per-case results, and overall result without logging generated draft text.

## Versioning

The current set is `apps/api/evals/grounded-content.v1.json`. Create a new version when expectations or cases change materially. Update the set's `promptVersion` whenever the production prompt changes; the harness intentionally refuses stale prompt/fixture combinations.

Re-run the evaluation after changing the prompt, model, structured-output schema, deterministic validators, or fixture set.
