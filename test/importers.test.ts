import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { importChatGPT } from "../src/importers/chatgpt.js";
import { CLAUDE_FALLBACK_MODEL, importClaude } from "../src/importers/claude.js";
import { GEMINI_FALLBACK_MODEL, htmlToText, importGemini } from "../src/importers/gemini.js";
import { importGrok } from "../src/importers/grok.js";
import { importFile, importJson } from "../src/importers/index.js";
import { estimateTokens, parseTime } from "../src/importers/thread.js";

const text = (n: number) => "abcd".repeat(n); // n tokens estimés

describe("estimateTokens / parseTime", () => {
  it("≈ 4 caractères par token, 1 par idéogramme", () => {
    expect(estimateTokens(text(10))).toBe(10);
    expect(estimateTokens("日本語")).toBe(3);
    expect(estimateTokens("")).toBe(0);
  });
  it("lit secondes, millisecondes, ISO et MongoDB", () => {
    const iso = "2026-11-01T00:00:00.000Z";
    expect(parseTime(1793491200)?.toISOString()).toBe(iso);
    expect(parseTime(1793491200000)?.toISOString()).toBe(iso);
    expect(parseTime(iso)?.toISOString()).toBe(iso);
    expect(parseTime({ $date: { $numberLong: "1793491200000" } })?.toISOString()).toBe(iso);
  });
});

const chatgpt = [
  {
    create_time: 1793491200,
    default_model_slug: "gpt-4o",
    mapping: {
      root: { parent: null, message: null },
      sys: { parent: "root", message: { author: { role: "system" }, content: { content_type: "text", parts: [""] } } },
      u1: { parent: "sys", message: { author: { role: "user" }, content: { content_type: "text", parts: [text(100)] } } },
      a1: {
        parent: "u1",
        message: { author: { role: "assistant" }, content: { content_type: "text", parts: [text(50)] }, metadata: { model_slug: "gpt-4o" } },
      },
      // Réponse régénérée : même parent, calculée elle aussi.
      a1bis: {
        parent: "u1",
        message: { author: { role: "assistant" }, content: { content_type: "text", parts: [text(30)] }, metadata: { model_slug: "o3" } },
      },
      u2: { parent: "a1", message: { author: { role: "user" }, content: { content_type: "text", parts: [text(10)] } } },
      a2: {
        parent: "u2",
        create_time: 1793577600,
        message: {
          author: { role: "assistant" },
          create_time: 1793577600,
          content: { content_type: "thoughts", thoughts: [{ summary: "", content: text(20) }] },
        },
      },
    },
  },
];

describe("importChatGPT", () => {
  it("compte chaque nœud assistant, branches comprises, avec le chemin en entrée", () => {
    const records = importChatGPT(chatgpt as never);
    const byOutput = Object.fromEntries(records.map((r) => [r.outputTokens, r]));
    expect(records).toHaveLength(3);
    expect(byOutput[50]).toMatchObject({ model: "gpt-4o", inputTokens: 100 });
    expect(byOutput[30]).toMatchObject({ model: "o3", inputTokens: 100 });
    // a2 : contexte = u1 + a1 + u2, modèle par défaut de la conversation
    expect(byOutput[20]).toMatchObject({ model: "gpt-4o", inputTokens: 160, periodStart: "2026-11-02T00:00:00.000Z" });
  });
});

describe("importClaude", () => {
  it("cumule le contexte, compte la réflexion en sortie et les pièces jointes en entrée", () => {
    const records = importClaude([
      {
        created_at: "2026-11-01T00:00:00Z",
        chat_messages: [
          { sender: "human", text: text(10), attachments: [{ extracted_content: text(90) }] },
          {
            sender: "assistant",
            created_at: "2026-11-01T00:01:00Z",
            content: [
              { type: "thinking", thinking: text(40) },
              { type: "tool_result", content: text(200) },
              { type: "text", text: text(60) },
            ],
          },
          { sender: "human", text: text(5) },
          { sender: "assistant", text: text(15) },
        ],
      },
    ]);
    expect(records).toHaveLength(2);
    // "\n" de jointure : ±1 token d'arrondi
    expect(records[0].model).toBe(CLAUDE_FALLBACK_MODEL);
    expect(records[0].inputTokens).toBeCloseTo(100, -1);
    expect(records[0].outputTokens).toBeCloseTo(100, -1);
    expect(records[1].inputTokens).toBeCloseTo(405, -1);
    expect(records[1].outputTokens).toBe(15);
  });
});

describe("importGemini", () => {
  it("lit requête et réponse HTML, ignore les autres produits", () => {
    const records = importGemini([
      { header: "Gemini Apps", title: `Prompted ${text(8)}`, time: "2026-11-01T10:00:00Z", products: ["Gemini Apps"], safeHtmlItem: [{ html: `<p>${text(25)}</p>` }] },
      { header: "Gemini Apps", title: "Used an Assistant feature", time: "2026-11-01T11:00:00Z", products: ["Gemini Apps"] },
      { header: "YouTube", title: "Watched something", time: "2026-11-01T12:00:00Z", products: ["YouTube"], safeHtmlItem: [{ html: "<p>x</p>" }] },
    ]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ provider: "gemini", model: GEMINI_FALLBACK_MODEL, outputTokens: 25 });
  });
  it("décode le HTML", () => {
    expect(htmlToText("<p>a &amp; b</p><ul><li>c&#39;est</li></ul>")).toBe("a & b c'est");
  });
});

describe("importGrok", () => {
  it("trouve les conversations dans une structure non documentée", () => {
    const records = importGrok({
      conversations: [
        {
          conversation: { id: "c1", title: "t" },
          responses: [
            { response: { sender: "ASSISTANT", message: text(30), model: "grok-4", create_time: { $date: { $numberLong: "1793491260000" } } } },
            { response: { sender: "human", message: text(12), create_time: { $date: { $numberLong: "1793491200000" } } } },
          ],
        },
      ],
    });
    // trié par date : la question précède la réponse
    expect(records).toEqual([expect.objectContaining({ provider: "grok", model: "grok-4", inputTokens: 12, outputTokens: 30 })]);
  });
});

describe("importJson / importFile", () => {
  it("détecte le format", () => {
    expect(importJson(chatgpt, "conversations.json").provider).toBe("chatgpt");
    expect(() => importJson({ foo: 1 }, "x.json")).toThrow("format non reconnu");
  });

  it("lit un zip ChatGPT et un zip Takeout en ignorant les autres services", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aifp-"));
    const gpt = join(dir, "chatgpt.zip");
    writeFileSync(gpt, zipSync({ "conversations.json": strToU8(JSON.stringify(chatgpt)), "image.png": new Uint8Array(10) }));
    expect((await importFile(gpt)).map((r) => r.provider)).toEqual(["chatgpt"]);

    const gem = [{ header: "Gemini Apps", title: "Prompted hi", time: "2026-11-01T10:00:00Z", products: ["Gemini Apps"], safeHtmlItem: [{ html: "<p>hello there</p>" }] }];
    const takeout = join(dir, "takeout.zip");
    writeFileSync(
      takeout,
      zipSync({
        "Takeout/My Activity/Gemini Apps/MyActivity.json": strToU8(JSON.stringify(gem)),
        "Takeout/My Activity/YouTube/MyActivity.json": strToU8("[]"),
      }),
    );
    const res = await importFile(takeout);
    expect(res).toHaveLength(1);
    expect(res[0].provider).toBe("gemini");
  });
});
