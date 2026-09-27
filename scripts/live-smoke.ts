import { getAknDocument, searchCaseLaw, searchLegislation, verifyCitation, checkCitator } from "../src/index.js";

// This check deliberately fails on blocked/unavailable upstream access. It is
// separate from deterministic CI and never turns a 403 into a passing result.
const search = await searchCaseLaw({ court: "KESC", year: 2022, limit: 1 });
if (search.isError) throw new Error(search.content[0]!.text);
const record = JSON.parse(search.content[0]!.text).results[0];
if (!record?.akn_url) throw new Error("No Supreme Court record was returned.");
console.log("PASS: live court directory returned an AKN judgment.");

const judgment = await getAknDocument({ akn_url: record.akn_url });
if (judgment.isError || judgment.content[0]!.text.length < 800) throw new Error("Judgment text retrieval failed: " + judgment.content[0]!.text.slice(0, 250));
console.log("PASS: live judgment text retrieved.");

const citation = await verifyCitation({ citation_string: record.akn_url });
if (!JSON.parse(citation.content[0]!.text).verified) throw new Error(citation.content[0]!.text);
const treatment = await checkCitator({ case_akn_url: record.akn_url });
if (JSON.parse(treatment.content[0]!.text).status !== "not_checked") throw new Error(treatment.content[0]!.text);
console.log("PASS: existence verification; treatment remains not_checked.");

const constitution = await getAknDocument({ akn_url: "/akn/ke/act/2010/constitution/eng@2010-09-03", article: "50" });
if (constitution.isError || !/fair hearing/i.test(constitution.content[0]!.text)) throw new Error("Constitution Article 50 retrieval failed: " + constitution.content[0]!.text.slice(0, 250));
console.log("PASS: Constitution Article 50 contains the fair-hearing provision.");

const statutes = await searchLegislation({ act_name: "Employment Act", limit: 5 });
if (statutes.isError || !JSON.parse(statutes.content[0]!.text).results.some((item: { short_title: string }) => /Employment Act/i.test(item.short_title))) {
  throw new Error("Employment Act search failed: " + statutes.content[0]!.text.slice(0, 250));
}
console.log("PASS: live Employment Act search.");
