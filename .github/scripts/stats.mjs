// Generates stats.svg and top-langs.svg from the GitHub GraphQL API.
import { writeFileSync, mkdirSync } from "node:fs";

const login = process.env.GH_LOGIN;
const token = process.env.GH_TOKEN;

const query = `query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    pullRequests { totalCount }
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      totalPullRequestContributions
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
      totalCount
      nodes {
        name
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { login } }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
const u = json.data.user;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const font = `font-family="Segoe UI, Ubuntu, Helvetica, Arial, sans-serif"`;
const card = (w, h, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${font}>
  <rect x="0.5" y="0.5" rx="6" width="${w - 1}" height="${h - 1}" fill="#ffffff" stroke="#e4e2e2"/>
  <text x="25" y="35" font-size="18" font-weight="600" fill="#2f80ed">${esc(title)}</text>
  ${body}
</svg>\n`;

const repos = u.repositories.nodes.filter((r) => r.name !== login);
const cc = u.contributionsCollection;
const stats = [
  ["Commits (last year)", cc.totalCommitContributions + cc.restrictedContributionsCount],
  ["Pull requests", u.pullRequests.totalCount],
  ["Repositories", repos.length],
  ["Stars earned", repos.reduce((n, r) => n + r.stargazerCount, 0)],
  ["Followers", u.followers.totalCount],
];
const statsBody = stats
  .map(([k, v], i) => `<g transform="translate(25, ${65 + i * 24})">
    <text font-size="14" fill="#434d58">${esc(k)}:</text>
    <text x="200" font-size="14" font-weight="700" fill="#333">${v}</text>
  </g>`)
  .join("\n  ");

const totals = new Map();
for (const r of repos)
  for (const { size, node } of r.languages.edges) {
    const t = totals.get(node.name) ?? { size: 0, color: node.color ?? "#858585" };
    t.size += size;
    totals.set(node.name, t);
  }
const all = [...totals].sort((a, b) => b[1].size - a[1].size);
const grand = all.reduce((n, [, t]) => n + t.size, 0) || 1;
const langs = all.filter(([, t]) => t.size / grand >= 0.0005).slice(0, 8);
const sum = langs.reduce((n, [, t]) => n + t.size, 0) || 1;
let x = 0;
const bar = langs
  .map(([, t]) => {
    const w = (t.size / sum) * 390;
    const seg = `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="8" fill="${t.color}"/>`;
    x += w;
    return seg;
  })
  .join("");
const legend = langs
  .map(([name, t], i) => `<g transform="translate(${(i % 2) * 195}, ${Math.floor(i / 2) * 22})">
    <circle cx="5" cy="-4" r="5" fill="${t.color}"/>
    <text x="16" font-size="12" fill="#434d58">${esc(name)} ${((t.size / sum) * 100).toFixed(1)}%</text>
  </g>`)
  .join("\n    ");
const langBody = `<clipPath id="bar"><rect width="390" height="8" rx="4"/></clipPath>
  <g clip-path="url(#bar)" transform="translate(25, 55)">${bar}</g>
  <g transform="translate(25, 90)">
    ${legend}
  </g>`;

mkdirSync("assets", { recursive: true });
writeFileSync("assets/stats.svg", card(440, 195, "Yash's GitHub Stats", statsBody));
writeFileSync("assets/top-langs.svg", card(440, 195, "Most Used Languages", langBody));
console.log("stats:", Object.fromEntries(stats), "langs:", langs.map(([n]) => n));
