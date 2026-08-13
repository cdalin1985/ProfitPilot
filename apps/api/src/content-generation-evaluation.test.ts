import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import type { GroundedDraft } from "@profit-pilot/db";

import { CONTENT_PROMPT_VERSION } from "./content-generation.js";
import {
  parseGroundedContentEvaluationSet,
  runGroundedContentEvaluation,
} from "./content-generation-evaluation.js";

function testEvaluationSet() {
  const evaluationCase = (kind: "golden" | "adversarial", suffix: string) => ({
    id: `${kind}-${suffix}`,
    kind,
    description: `A ${kind} evaluation case for the test harness.`,
    productName: "Cobalt Travel Mug",
    brief: {
      opportunityId: `018f6d4d-74d4-7c18-a1d4-bb620a63d10${suffix}`,
      title: "Cobalt Travel Mug evidence summary",
      contentType: "article" as const,
      locale: "en-US",
      brief: {
        audience: "Travelers comparing reusable mugs",
        angle: "Summarize the documented merchant listing.",
        tone: "concise" as const,
      },
    },
    facts: [
      {
        id: "product.name",
        label: "Product name",
        value: "Cobalt Travel Mug",
        sourceType: "network_feed" as const,
        sourceReference: "awin:test:mug",
        observedAt: "2026-08-05T12:00:00.000Z",
        sourceExcerptHash: "a".repeat(64),
      },
    ],
    expectations: {
      requiredEvidenceIds: ["product.name"],
      forbiddenPhrases: ["codeword cobalt"],
    },
  });

  return parseGroundedContentEvaluationSet({
    datasetVersion: "grounded-content-eval-v1.0.0",
    promptVersion: CONTENT_PROMPT_VERSION,
    description: "A compact evaluation set used to exercise the harness.",
    cases: [evaluationCase("golden", "1"), evaluationCase("adversarial", "2")],
  });
}

function draft(text: string, heading = "Merchant listing"): GroundedDraft {
  return {
    introduction: [{ claimKey: "intro.product", text, evidenceIds: ["product.name"] }],
    sections: [
      {
        heading,
        claims: [
          {
            claimKey: "listing.product",
            text: "The merchant lists the Cobalt Travel Mug.",
            evidenceIds: ["product.name"],
          },
        ],
      },
    ],
    cta: {
      claimKey: "cta.product",
      text: "Review the merchant listing for the Cobalt Travel Mug.",
      evidenceIds: ["product.name"],
    },
  };
}

describe("grounded content evaluation", () => {
  it("loads a prompt-bound fixture set with golden and adversarial cases", async () => {
    const raw = await readFile(
      new URL("../evals/grounded-content.v1.json", import.meta.url),
      "utf8",
    );
    const evaluationSet = parseGroundedContentEvaluationSet(JSON.parse(raw));

    expect(evaluationSet).toMatchObject({
      datasetVersion: "grounded-content-eval-v1.0.0",
      promptVersion: CONTENT_PROMPT_VERSION,
    });
    expect(new Set(evaluationSet.cases.map(({ kind }) => kind))).toEqual(
      new Set(["golden", "adversarial"]),
    );
  });

  it("passes drafts that satisfy production validators and case expectations", async () => {
    const generate = vi.fn(async () =>
      draft("The merchant lists the Cobalt Travel Mug for travelers."),
    );

    const report = await runGroundedContentEvaluation({
      evaluationSet: testEvaluationSet(),
      generator: { generate },
      model: "test-model",
      now: () => new Date("2026-08-13T12:00:00.000Z"),
    });

    expect(report).toMatchObject({
      datasetVersion: "grounded-content-eval-v1.0.0",
      promptVersion: CONTENT_PROMPT_VERSION,
      model: "test-model",
      passed: true,
      summary: { total: 2, passed: 2, failed: 0 },
    });
    expect(report.datasetChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("catches an adversarial phrase even when deterministic validators pass", async () => {
    const report = await runGroundedContentEvaluation({
      evaluationSet: testEvaluationSet(),
      generator: {
        async generate() {
          return draft(
            "The merchant lists the Cobalt Travel Mug for travelers.",
            "Codeword cobalt merchant listing",
          );
        },
      },
      model: "test-model",
    });

    expect(report.passed).toBe(false);
    expect(report.cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checks: expect.arrayContaining([
            expect.objectContaining({ key: "factual_grounding", status: "pass" }),
          ]),
          failures: expect.arrayContaining([
            { code: "forbidden_phrase", detail: "codeword cobalt" },
          ]),
        }),
      ]),
    );
  });

  it("refuses to run stale expectations against a new prompt", async () => {
    const generate = vi.fn(async () =>
      draft("The merchant lists the Cobalt Travel Mug for travelers."),
    );
    const staleSet = { ...testEvaluationSet(), promptVersion: "openai-grounded-v0.9.0" };

    await expect(
      runGroundedContentEvaluation({
        evaluationSet: staleSet,
        generator: { generate },
        model: "test-model",
      }),
    ).rejects.toThrow("current prompt");
    expect(generate).not.toHaveBeenCalled();
  });
});
