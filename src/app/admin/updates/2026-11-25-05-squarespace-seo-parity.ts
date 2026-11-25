import type { AppUpdate } from "../appUpdates";

export default {
  id: "squarespace-seo-parity",
  date: "2026-11-25",
  title: "Hide a page from Google, verify with Bing, and see which photos need a description",
  summary: "Three search tools that site builders like Squarespace include, now in your shop. Any Studio page can be hidden from search engines while staying in the shop (Design › Pages › open a page › Google listing › Hide from search engines); it leaves the sitemap and gets a noindex tag, which suits thank-you or test pages. Bing Webmaster Tools can now be verified with its own token next to Google's (Design › Text & labels › Site & sharing), and Bing also feeds DuckDuckGo, Yahoo and ChatGPT search. The Overview's ready-to-sell checks now count how many book photos have a description for Google Images and name any book hidden from search.",
  links: [{ label: "Open Design", tab: "design" }, { label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
