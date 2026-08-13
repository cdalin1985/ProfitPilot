import { z } from "zod";

const publisherSchema = z.object({
  publisherId: z.number().int().positive(),
  name: z.string().min(1),
});

const publishersSchema = z.array(publisherSchema).min(1);

export type AwinPublisher = z.infer<typeof publisherSchema>;

export class AwinAuthenticationError extends Error {
  readonly code = "awin_authentication_failed";

  constructor() {
    super("Awin rejected the access token");
    this.name = "AwinAuthenticationError";
  }
}

export class AwinUnavailableError extends Error {
  readonly code = "awin_unavailable";

  constructor(message = "Awin is temporarily unavailable") {
    super(message);
    this.name = "AwinUnavailableError";
  }
}

export interface AwinClient {
  listPublishers(accessToken: string): Promise<AwinPublisher[]>;
}

export function createAwinClient(
  fetchImplementation: typeof fetch = fetch,
  baseUrl = "https://api.awin.com",
): AwinClient {
  return {
    async listPublishers(accessToken) {
      let response: Response;
      try {
        response = await fetchImplementation(`${baseUrl}/publishers`, {
          headers: {
            accept: "application/json",
            authorization: `Bearer ${accessToken}`,
          },
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new AwinUnavailableError();
      }

      if (response.status === 401 || response.status === 403) {
        throw new AwinAuthenticationError();
      }
      if (!response.ok) {
        throw new AwinUnavailableError(`Awin returned HTTP ${response.status}`);
      }

      const parsed = publishersSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new AwinUnavailableError("Awin returned an unexpected publisher response");
      }
      return parsed.data;
    },
  };
}
