// Small web server for the portal.
// - Serves the site's files (HTML, CSS, JS).
// - Handles POST /api/ideas: asks Claude for design ideas and returns them.
// The AI key stays here on the server and is never sent to the browser.
//
// Start it with:  npm start   (after running npm install once)

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MODEL = "claude-sonnet-5-5";

// Input limits (the page checks these too, but the server must not trust it).
const PROBLEM_MIN = 20;
const PROBLEM_MAX = 1000;
const CONSTRAINTS_MAX = 500;
const IDEAS_MIN = 3;
const IDEAS_MAX = 6;
const BODY_MAX_BYTES = 10 * 1024;

// Usage limit per visitor, to keep AI costs under control.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;

// ---------- Static files ----------

// Only these top-level folders/files are public. Everything else
// (server code, node_modules, package files) is never served.
const PUBLIC_DIRS = ["css", "js", "tools"];
const PUBLIC_FILES = ["index.html"];

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return sendText(res, 400, "Bad request");
  }
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.normalize(path.join(ROOT, urlPath));
  const relative = path.relative(ROOT, filePath);
  const [topLevel] = relative.split(path.sep);

  const isPublic =
    !relative.startsWith("..") &&
    !path.isAbsolute(relative) &&
    (PUBLIC_FILES.includes(relative) || PUBLIC_DIRS.includes(topLevel));
  const type = CONTENT_TYPES[path.extname(filePath)];

  if (!isPublic || !type) return sendText(res, 404, "Not found");

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  } catch {
    sendText(res, 404, "Not found");
  }
}

// ---------- Helpers ----------

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > BODY_MAX_BYTES) {
        reject(new Error("too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Remembers when each visitor made requests, and refuses after the limit.
const requestLog = new Map();

function isRateLimited(visitor) {
  const now = Date.now();
  const recent = (requestLog.get(visitor) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    requestLog.set(visitor, recent);
    return true;
  }
  recent.push(now);
  requestLog.set(visitor, recent);
  return false;
}

// Clear out old entries now and then so memory doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [visitor, times] of requestLog) {
    if (times.every((t) => now - t >= RATE_WINDOW_MS)) requestLog.delete(visitor);
  }
}, RATE_WINDOW_MS).unref();

// ---------- AI ----------

const SYSTEM_PROMPT = `You help high-school students with the engineering design process by brainstorming design ideas for a problem they describe.

Write for high-school students: plain, friendly language, short sentences, and explain any technical term in a few words. Suggest materials, tools and methods a high-school student could realistically get or use (school workshop, hardware store, simple electronics kits, 3D printing, recycled materials).

Make the ideas genuinely different from each other: different working principles or approaches, not small variations of one idea. Respect every constraint the student gives. For each idea, be honest about weaknesses, and end with one question that would help the student test or improve it.

If the problem is not a design problem (for example, it asks you to write an essay or is unrelated to designing something), still return ideas that reframe it as a design challenge if reasonable, keeping everything appropriate for school.`;

// The exact shape Claude must reply with (structured output).
const IDEAS_SCHEMA = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          how_it_works: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          weaknesses: { type: "array", items: { type: "string" } },
          next_question: { type: "string" },
        },
        required: ["title", "how_it_works", "strengths", "weaknesses", "next_question"],
        additionalProperties: false,
      },
    },
  },
  required: ["ideas"],
  additionalProperties: false,
};

let client = null;
function getClient() {
  if (!client) {
    client = new Anthropic({ timeout: 120 * 1000, maxRetries: 2 });
  }
  return client;
}

async function generateIdeas({ problem, constraints, count }) {
  const userMessage = [
    `Problem statement:\n${problem}`,
    constraints ? `Constraints and requirements:\n${constraints}` : "Constraints and requirements: none given.",
    `Give exactly ${count} design ideas. For each: a short title; "how it works" in 2-3 sentences; 2-3 strengths; 2-3 weaknesses; and one question to explore next.`,
  ].join("\n\n");

  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: IDEAS_SCHEMA },
    },
    // If the model declines, the API retries on a fallback model automatically.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  if (response.stop_reason === "refusal") {
    const err = new Error("refusal");
    err.code = "refusal";
    throw err;
  }
  if (response.stop_reason === "max_tokens") {
    const err = new Error("cut off");
    err.code = "truncated";
    throw err;
  }

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  const parsed = JSON.parse(text);
  const ideas = Array.isArray(parsed.ideas) ? parsed.ideas.slice(0, count) : [];
  if (ideas.length === 0) throw new Error("no ideas");
  return ideas;
}

// ---------- POST /api/ideas ----------

async function handleIdeas(req, res) {
  let input;
  try {
    input = JSON.parse(await readBody(req));
  } catch (err) {
    if (err.message === "too_large") return sendError(res, 413, "Your input is too long.");
    return sendError(res, 400, "The request could not be read. Please try again.");
  }

  const problem = typeof input.problem === "string" ? input.problem.trim() : "";
  const constraints = typeof input.constraints === "string" ? input.constraints.trim() : "";
  const count = Number(input.count);

  if (problem.length < PROBLEM_MIN) {
    return sendError(res, 400, `Please describe the problem in at least ${PROBLEM_MIN} characters.`);
  }
  if (problem.length > PROBLEM_MAX) {
    return sendError(res, 400, `The problem statement must be ${PROBLEM_MAX} characters or fewer.`);
  }
  if (constraints.length > CONSTRAINTS_MAX) {
    return sendError(res, 400, `Constraints must be ${CONSTRAINTS_MAX} characters or fewer.`);
  }
  if (!Number.isInteger(count) || count < IDEAS_MIN || count > IDEAS_MAX) {
    return sendError(res, 400, `Choose between ${IDEAS_MIN} and ${IDEAS_MAX} ideas.`);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return sendError(res, 503, "The AI isn't set up on this server yet. Please ask your teacher or the site owner.");
  }

  const visitor = req.socket.remoteAddress || "unknown";
  if (isRateLimited(visitor)) {
    return sendError(res, 429, "You've made a lot of requests. Please wait a few minutes and try again.");
  }

  try {
    const ideas = await generateIdeas({ problem, constraints, count });
    sendJson(res, 200, { ideas });
  } catch (err) {
    console.error("Idea generation failed:", err);
    if (err.code === "refusal") {
      return sendError(res, 422, "The AI couldn't help with this problem. Try rewording it as a design challenge.");
    }
    if (err.code === "truncated") {
      return sendError(res, 502, "The answer was too long and got cut off. Try asking for fewer ideas.");
    }
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      return sendError(res, 503, "The AI isn't set up correctly on this server. Please tell the site owner.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      return sendError(res, 503, "The AI is very busy right now. Please try again in a minute.");
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return sendError(res, 503, "The server couldn't reach the AI. Please try again in a minute.");
    }
    if (err instanceof Anthropic.APIError) {
      return sendError(res, 502, "The AI had a problem answering. Please try again.");
    }
    sendError(res, 500, "Something went wrong. Please try again.");
  }
}

// ---------- Server ----------

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  if (pathname === "/api/ideas") {
    if (req.method !== "POST") return sendError(res, 405, "Use POST.");
    return handleIdeas(req, res);
  }
  if (req.method !== "GET" && req.method !== "HEAD") return sendText(res, 405, "Method not allowed");
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Engineering Design Tools running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Note: ANTHROPIC_API_KEY is not set, so the Design Idea Generator will show an error.");
  }
});
