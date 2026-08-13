# How to Use Kenya Law MCP in Claude & ChatGPT

A simple guide for lawyers to connect live Kenya legal databases (case law, statutes, cause lists, gazettes) to Claude and ChatGPT.

---

## Quick Links

- **Claude / MCP Server Link**: `https://kenya-law-mcp.robinskarani1.workers.dev/`
- **ChatGPT Action Schema Link**: `https://kenya-law-mcp.robinskarani1.workers.dev/openapi.json`

---

## 1. How to Connect to Claude (Claude Desktop & Web)

1. Open **Claude Desktop**.
2. Click **Claude** in the top menu $\rightarrow$ Open **Settings** (or press `Cmd + ,` on Mac / `Ctrl + ,` on Windows).
3. Select **Connectors** (or **Developer / MCP**) $\rightarrow$ Click **Add New Connector**.
4. Fill in the form:
   - **Name**: `Kenya Law MCP`
   - **URL**: `https://kenya-law-mcp.robinskarani1.workers.dev/`
5. Click **Save** / **Connect**.

---

## 2. How to Connect to ChatGPT (Custom GPTs)

### Step 1: Create a Custom GPT
1. Open [ChatGPT](https://chatgpt.com) $\rightarrow$ Click **Explore GPTs** in the sidebar $\rightarrow$ Click **+ Create** (top right).
2. Click the **Configure** tab.
3. Name your GPT (e.g. `Kenya Legal Assistant`).

### Step 2: Write Your System Instructions (Custom Prompts)
You can write any system instructions tailored to your specific law practice! Here are a few examples you can copy or modify:

- **General Litigation Practice**:
  > *"You are an expert Kenyan legal research assistant. Always cross-reference statutory provisions and case law citations against the Kenya Law database tools. Provide accurate OSCOLA citations and highlight authoritative holdings."*

- **Employment & Labour Law Practice**:
  > *"You are a specialized Employment & Labour Law assistant in Kenya. Focus on the Employment Act 2007, ELRC judgments, constructive dismissal precedents, and statutory notice periods."*

- **Commercial & Corporate Practice**:
  > *"You are a corporate legal assistant in Kenya. Search the Companies Act 2015, Tax Appeals Tribunal decisions, and High Court Commercial Division precedents."*

### Step 3: Add the Kenya Law Action
1. Scroll down to **Actions** $\rightarrow$ Click **Create new action**.
2. In **Import from URL**, paste:
   `https://kenya-law-mcp.robinskarani1.workers.dev/openapi.json`
3. Click **Import**. *(Or copy-paste the text from `openapi.json` directly into the Schema text box).*
4. Leave **Authentication** set to **None**.
5. Click **Save** / **Publish**.

---

## 3. Sample Legal Research Prompts

Once connected, ask questions naturally:

- **Precedents**: *"Find recent Court of Appeal decisions on wrongful termination under Section 45 of the Employment Act."*
- **Statutes**: *"Pull Section 31 of the Data Protection Act 2019 and explain the DPIA requirements."*
- **Citation Check**: *"Verify Giella v Cassman Brown [1973] EA 358 and check if it has been overruled or distinguished."*
- **Daily Cause List**: *"Get today's cause list for Milimani High Court Commercial Division."*

---

## Best Practices
- **Verify Citations**: Always cross-check AI-retrieved cases and statutory sections against official reporters or printed gazettes before filing court pleadings.
- **Client Confidentiality**: Avoid typing confidential client names or privileged information into prompt text.
