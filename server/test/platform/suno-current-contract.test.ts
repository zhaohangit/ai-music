import { describe, it, expect, vi } from "vitest";
import {
  SunoClient,
  mapGeneratePayload,
  normalizeSunoTask,
} from "../../src/suno.js";
import {
  validateGenerateForProfile,
  DEFAULT_MUSIC_MODEL_PROFILES,
} from "../../src/platform/catalog.js";
import { musicOperationDefinition } from "../../src/platform/music-operations.js";
describe("MXAPI September 2026 music contract", () => {
  it("sends all new download endpoints with custom_id only and normalizes their results", async () => {
    const mock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ code: 200, data: { task_id: "download-job" } }),
        ),
    );
    const client = new SunoClient(
      "https://provider.test",
      "test-key",
      mock as typeof fetch,
    );
    for (const format of ["mp3", "m4a", "wav"] as const) {
      await expect(client.downloadAudio(format, "clip-1")).resolves.toBe(
        "download-job",
      );
      const [url, init] = mock.mock.calls.at(-1)! as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe(`https://provider.test/api/v2/music/download-${format}`);
      expect(JSON.parse(String(init.body))).toEqual({ suno_id: "clip-1" });
    }
    const r = normalizeSunoTask({
      status: "completed",
      result: {
        extend: JSON.stringify({
          mp3_file_url: "https://cdn.test/a.mp3",
          m4a_file_url: "https://cdn.test/a.m4a",
          wav_file_url: "https://cdn.test/a.wav",
        }),
      },
    });
    expect(r).toMatchObject({
      mp3Url: "https://cdn.test/a.mp3",
      m4aUrl: "https://cdn.test/a.m4a",
      wavUrl: "https://cdn.test/a.wav",
    });
  });
  it("accepts V6 creative controls and keeps Max on a distinct price contract", () => {
    const profile = DEFAULT_MUSIC_MODEL_PROFILES.find(
      (p) => p.id === "chirp-hawk",
    )!;
    const request = validateGenerateForProfile(
      {
        mode: "custom",
        title: "Green",
        lyrics: "嫩绿的回信",
        style: "acoustic",
        isMaxMode: true,
        augCreativity: 3.2,
      },
      profile,
    );
    expect(mapGeneratePayload(request)).toMatchObject({
      mv: "chirp-hawk",
      metadata: { is_max_mode: true, control_sliders: { aug_creativity: 3.2 } },
    });
    expect(
      musicOperationDefinition("generate", false, true).operationCode,
    ).toBe("generation_max_pair");
    expect(musicOperationDefinition("generate").operationCode).toBe(
      "generation_pair",
    );
    expect(() =>
      validateGenerateForProfile({ ...request, augCreativity: 5 }, profile),
    ).toThrow();
    expect(() =>
      validateGenerateForProfile({ ...request, isMaxMode: "false" }, profile),
    ).toThrow();
  });
});
