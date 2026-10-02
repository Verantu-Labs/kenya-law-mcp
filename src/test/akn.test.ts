import { describe, expect, test } from "bun:test";
import { parseAknXml } from "../akn/parser.js";

describe("Akoma Ntoso (AKN) XML Parser", () => {
  test("parses structured AKN XML into clean Markdown with OSCOLA citation", () => {
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
    <akomaNtoso>
      <act>
        <meta>
          <identification>
            <FRBRWork>
              <FRBRname value="Alcoholic Drinks Control Act 2010"/>
              <FRBRdate date="2010-08-13"/>
            </FRBRWork>
          </identification>
          <publication name="[2010] Cap 121"/>
        </meta>
        <body>
          <section eId="sec_1">
            <num>1.</num>
            <heading>Short Title</heading>
            <p>This Act may be cited as the Alcoholic Drinks Control Act, 2010.</p>
          </section>
        </body>
      </act>
    </akomaNtoso>`;

    const parsed = parseAknXml(sampleXml, "/akn/ke/act/2010/4");
    expect(parsed.title).toBe("Alcoholic Drinks Control Act 2010");
    expect(parsed.docType).toBe("act");
    expect(parsed.oscolaCitation).toBe("[2010] Cap 121");
    expect(parsed.markdown).toContain("# Alcoholic Drinks Control Act 2010");
    expect(parsed.markdown).toContain("Short Title");
    expect(parsed.markdown).toContain("This Act may be cited as the Alcoholic Drinks Control Act, 2010.");
  });

  test("handles empty or html fallbacks without crashing", () => {
    const htmlText = `<!DOCTYPE html>
      <html><body>
        <header>Site navigation that must not be treated as judgment text</header>
        <main><article>
          <h1>High Court Judgment</h1>
          <p>Paragraph 1 text</p>
        </article></main>
        <footer>Site footer that must not be treated as judgment text</footer>
      </body></html>`;
    const parsed = parseAknXml(htmlText, "/akn/ke/judgment/kehc/2026/1");
    expect(parsed.title).toBe("High Court Judgment");
    expect(parsed.markdown).toContain("High Court Judgment");
    expect(parsed.markdown).toContain("Paragraph 1 text");
    expect(parsed.markdown).not.toContain("Site navigation");
    expect(parsed.markdown).not.toContain("Site footer");
  });

  test("renders paragraphs nested inside AKN content containers", () => {
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
    <akomaNtoso>
      <judgment>
        <meta>
          <identification>
            <FRBRWork>
              <FRBRname value="Sample Judgment"/>
            </FRBRWork>
          </identification>
        </meta>
        <judgmentBody>
          <section eId="sec_1">
            <num>1.</num>
            <heading>Introduction</heading>
            <content>
              <p>The court considered the evidence before it.</p>
              <subsection>
                <content><p>The reasons follow from the applicable law.</p></content>
              </subsection>
            </content>
          </section>
        </judgmentBody>
      </judgment>
    </akomaNtoso>`;

    const parsed = parseAknXml(sampleXml, "/akn/ke/judgment/kehc/2026/1");
    expect(parsed.markdown).toContain("The court considered the evidence before it.");
    expect(parsed.markdown).toContain("The reasons follow from the applicable law.");
  });
});
