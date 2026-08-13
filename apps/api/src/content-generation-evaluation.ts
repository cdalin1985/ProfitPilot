import { createHash } from "node:crypto";

import { z } from "zod";

import { createContentDraftSchema } from "@profit-pilot/contracts";
import type { ContentValidationCheck, GroundedDraft, GroundingFact } from "@profit-pilot/db";

import {
  CONTENT_PROMPT_VERSION,
  groundedDraftSchema,
  type GroundedDraftGenerator,
  validateGroundedDraft,
} from "./content-generation.js";

const evaluationFactSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(160),
    value: z.string().trim().min(1).max(600),
    sourceType: z.literal("network_feed"),
    sourceReference: z.string().trim().min(1).max(240),
    observedAt: z.string().datetime(),
    sourceExcerptHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const evaluationCaseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    kind: z.enum(["golden", "adversarial"]),
    description: z.string().trim().min(8).max(300),
    productName: z.string().trim().min(1).max(240),
    brief: createContentDraftSchema,
    facts: z.array(evaluationFactSchema).min(1).max(20),
    expectations: z
      .object({
        requiredEvidenceIds: z.array(z.string().trim().min(1).max(120)).max(20),
        forbiddenPhrases: z.array(z.string().trim().min(3).max(160)).max(20),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const factIds = new Set<string>();
    for (const [index, fact] of value.facts.entries()) {
      if (factIds.has(fact.id)) {
        context.addIssue({
          code: "custom",
          path: ["facts", index, "id"],
          message: `Duplicate fact id: ${fact.id}`,
        });
      }
      factIds.add(fact.id);
    }

    for (const [index, evidenceId] of value.expectations.requiredEvidenceIds.entries()) {
      if (!factIds.has(evidenceId)) {
        context.addIssue({
          code: "custom",
          path: ["expectations", "requiredEvidenceIds", index],
          message: `Required evidence id is not present in facts: ${evidenceId}`,
        });
      }
    }
  });

export const groundedContentEvaluationSetSchema = z
  .object({
    datasetVersion: z.string().regex(/^grounded-content-eval-v\d+\.\d+\.\d+$/),
    promptVersion: z.string().trim().min(1).max(120),
    description: z.string().trim().min(8).max(500),
    cases: z.array(evaluationCaseSchema).min(2).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const caseIds = new Set<string>();
    for (const [index, evaluationCase] of value.cases.entries()) {
      if (caseIds.has(evaluationCase.id)) {
        context.addIssue({
          code: "custom",
          path: ["cases", index, "id"],
          message: `Duplicate evaluation case id: ${evaluationCase.id}`,
        });
      }
      caseIds.add(evaluationCase.id);
    }

    for (const kind of ["golden", "adversarial"] as const) {
      if (!value.cases.some((evaluationCase) => evaluationCase.kind === kind)) {
        context.addIssue({
          code: "custom",
          path: ["cases"],
          message: `The evaluation set must include at least one ${kind} case`,
        });
      }
    }
  });

export type GroundedContentEvaluationSet = z.infer<typeof groundedContentEvaluationSetSchema>;
type GroundedContentEvaluationCase = GroundedContentEvaluationSet["cases"][number];

export interface GroundedContentEvaluationFailure {
  code: "forbidden_phrase" | "generation_error" | "missing_evidence" | "validator_not_passed";
  detail: string;
}

export interface GroundedContentEvaluationCaseResult {
  id: string;
  kind: "golden" | "adversarial";
  passed: boolean;
  durationMs: number;
  claimCount: number;
  citedEvidenceIds: string[];
  checks: Pick<ContentValidationCheck, "key" | "status">[];
  failures: GroundedContentEvaluationFailure[];
}

export interface GroundedContentEvaluationReport {
  reportVersion: "grounded-content-eval-report-v1";
  datasetVersion: string;
  datasetChecksum: string;
  promptVersion: string;
  model: string;
  generatedAt: string;
  passed: boolean;
  summary: { total: number; passed: number; failed: number };
  cases: GroundedContentEvaluationCaseResult[];
}

export function parseGroundedContentEvaluationSet(value: unknown): GroundedContentEvaluationSet {
  return groundedContentEvaluationSetSchema.parse(value);
}

function groundingFacts(evaluationCase: GroundedContentEvaluationCase): GroundingFact[] {
  return evaluationCase.facts.map((fact) => ({
    ...fact,
    observedAt: new Date(fact.observedAt),
  }));
}

function draftClaims(draft: GroundedDraft) {
  return [...draft.introduction, ...draft.sections.flatMap((section) => section.claims), draft.cta];
}

function scoreDraft(
  evaluationCase: GroundedContentEvaluationCase,
  draft: GroundedDraft,
  facts: GroundingFact[],
  durationMs: number,
): GroundedContentEvaluationCaseResult {
  const claims = draftClaims(draft);
  const citedEvidenceIds = [...new Set(claims.flatMap((claim) => claim.evidenceIds))].sort();
  const text = [
    ...claims.map((claim) => claim.text),
    ...draft.sections.map((section) => section.heading),
  ]
    .join(" ")
    .toLocaleLowerCase("en-US");
  const checks = validateGroundedDraft(draft, facts, []);
  const failures: GroundedContentEvaluationFailure[] = [];

  for (const check of checks) {
    if (check.status !== "pass") {
      failures.push({
        code: "validator_not_passed",
        detail: `${check.key}:${check.status}`,
      });
    }
  }

  for (const evidenceId of evaluationCase.expectations.requiredEvidenceIds) {
    if (!citedEvidenceIds.includes(evidenceId)) {
      failures.push({ code: "missing_evidence", detail: evidenceId });
    }
  }

  for (const phrase of evaluationCase.expectations.forbiddenPhrases) {
    if (text.includes(phrase.toLocaleLowerCase("en-US"))) {
      failures.push({ code: "forbidden_phrase", detail: phrase });
    }
  }

  return {
    id: evaluationCase.id,
    kind: evaluationCase.kind,
    passed: failures.length === 0,
    durationMs,
    claimCount: claims.length,
    citedEvidenceIds,
    checks: checks.map(({ key, status }) => ({ key, status })),
    failures,
  };
}

export async function runGroundedContentEvaluation(input: {
  evaluationSet: GroundedContentEvaluationSet;
  generator: GroundedDraftGenerator;
  model: string;
  now?: () => Date;
}): Promise<GroundedContentEvaluationReport> {
  const { evaluationSet, generator, model, now = () => new Date() } = input;
  if (evaluationSet.promptVersion !== CONTENT_PROMPT_VERSION) {
    throw new Error(
      `Evaluation set ${evaluationSet.datasetVersion} targets ${evaluationSet.promptVersion}; current prompt is ${CONTENT_PROMPT_VERSION}`,
    );
  }

  const results: GroundedContentEvaluationCaseResult[] = [];
  for (const evaluationCase of evaluationSet.cases) {
    const startedAt = performance.now();
    const facts = groundingFacts(evaluationCase);
    try {
      const draft = groundedDraftSchema.parse(
        await generator.generate({
          brief: evaluationCase.brief,
          productName: evaluationCase.productName,
          facts,
        }),
      );
      results.push(
        scoreDraft(evaluationCase, draft, facts, Math.round(performance.now() - startedAt)),
      );
    } catch (error) {
      results.push({
        id: evaluationCase.id,
        kind: evaluationCase.kind,
        passed: false,
        durationMs: Math.round(performance.now() - startedAt),
        claimCount: 0,
        citedEvidenceIds: [],
        checks: [],
        failures: [
          {
            code: "generation_error",
            detail: error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error",
          },
        ],
      });
    }
  }

  const passed = results.filter((result) => result.passed).length;
  return {
    reportVersion: "grounded-content-eval-report-v1",
    datasetVersion: evaluationSet.datasetVersion,
    datasetChecksum: createHash("sha256").update(JSON.stringify(evaluationSet)).digest("hex"),
    promptVersion: CONTENT_PROMPT_VERSION,
    model,
    generatedAt: now().toISOString(),
    passed: passed === results.length,
    summary: { total: results.length, passed, failed: results.length - passed },
    cases: results,
  };
}
