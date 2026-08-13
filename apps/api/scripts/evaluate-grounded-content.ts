import { readFile } from "node:fs/promises";

import {
  parseGroundedContentEvaluationSet,
  runGroundedContentEvaluation,
} from "../src/content-generation-evaluation.js";
import { createOpenAIGroundedDraftGenerator } from "../src/content-generation.js";
import { createOpenAICredentialResolver } from "../src/secrets.js";

function environmentValue(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (!value || /[\r\n\0]/.test(value)) {
    throw new Error(`${name} is required and must be a single non-empty value`);
  }
  return value;
}

async function main(): Promise<void> {
  const awsRegion = environmentValue("AWS_REGION", "us-east-1");
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(awsRegion)) {
    throw new Error("AWS_REGION must be a valid AWS region");
  }

  const secretReference = environmentValue("OPENAI_API_KEY_SECRET_REFERENCE");
  const model = environmentValue("OPENAI_GENERATION_MODEL", "gpt-5.6");
  const raw = await readFile(new URL("../evals/grounded-content.v1.json", import.meta.url), "utf8");
  const evaluationSet = parseGroundedContentEvaluationSet(JSON.parse(raw));
  const credentialResolver = createOpenAICredentialResolver({ AWS_REGION: awsRegion });
  const generator = createOpenAIGroundedDraftGenerator({
    model,
    apiKeySecretReference: secretReference,
    credentialResolver,
  });
  const report = await runGroundedContentEvaluation({ evaluationSet, generator, model });

  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Grounded content evaluation failed");
  process.exitCode = 1;
});
