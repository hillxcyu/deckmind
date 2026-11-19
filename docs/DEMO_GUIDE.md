# DeckMind — Seller Demo Guide

## Executive Summary & Pitch Context

* **Target Buyer Personas:** Chief Marketing Officers (CMOs), VP of Sales Enablement, Enterprise Strategy Leads, and Product Marketing Directors
* **Customer Pain Point:** Enterprise teams spend 6–10 hours per deck manually researching facts, formatting slide layouts, matching brand guidelines, and sourcing or designing bespoke visuals—delaying executive briefings and customer proposals.
* **Value Proposition:** DeckMind compresses presentation creation from hours to under 3 minutes by combining a multi-agent Gemini research-and-authoring pipeline on Vertex AI with automated brand style extraction, native 16:9 image generation, and one-click PPTX/PDF export.
* **Estimated Demo Duration:** 10–15 minutes

## How to Build

This section explains how DeckMind is architected and constructed end-to-end on Google Cloud using **Vertex AI (Gemini & Vertex AI Image Generation)**, **Cloud Run**, **Cloud SQL for PostgreSQL**, and **Secret Manager**.

### Step 1: Scaffold the Project & Dependencies

The application is a full-stack TypeScript/Node.js service (`package.json`, `package-lock.json`, `Dockerfile`) combining a React 19 + Vite + Tailwind CSS frontend (`src/`) with an Express API server (`server.ts`):

* `server.ts`: Serves the compiled React SPA from `dist/`, exposes REST endpoints (`/api/setup`, `/api/login`, `/api/decks`, `/api/chat`, `/api/image`, `/api/extract-style`, `/api/transform-style`, `/api/suggestions`, `/api/upload`, `/api/health`), and manages PostgreSQL persistence (`users`, `decks`, `images`, `jobs`, `attachments`).
* `Dockerfile`: Multi-stage `node:20-alpine` build using `npm ci` to install locked dependencies, `npm run build` to bundle the frontend, and `npx tsx server.ts` on port `3000`.

### Step 2: Build the Multi-Agent AI Pipeline (`src/lib/adk.ts`, `src/services/agentSystem.ts`)

DeckMind implements a structured multi-agent orchestration layer using `@google/genai` configured for Vertex AI (`GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_LOCATION=global`):

* **Search Agent (`createSearchAgent`)**: Uses `gemini-3.7-flash` with Google Search grounding (`tools: [{ googleSearch: {} }]`) to gather up-to-date facts, benchmarks, and market context before any slide is written.
* **Deck Agent (`createDeckAgent`)**: Uses `gemini-3.7-flash` with structured function calling (`updateDeckTool`, `updateSlideTool`) to emit slide titles, detailed bullet points, speaker notes, and rich visual prompts.
* **Main Orchestrator (`createMainAgent`)**: Enforces a 4-phase workflow (Research → Outlining & User Approval → Slide Execution → Verification) so sellers and buyers stay in control of the narrative.
* **Image Generation (`processImageJob` in `server.ts`)**: Generates 16:9 slide visuals and background plates asynchronously via `gemini-3.1-flash-image-preview` and stores them in PostgreSQL (`/api/images/:id`).

### Step 3: Wire Style Extraction, Interactive Preview & Export (`src/components/`, `src/services/export.ts`)

* **Brand Style Extraction (`StyleConfig.tsx`)**: Calls `/api/extract-style` to infer color palettes, typography, mood, and aesthetic from a brand name or URL, then compiles a system prompt via `/api/transform-style`.
* **Interactive Studio & Presenter Mode (`DeckPreview.tsx`, `PresenterView.tsx`)**: Supports live slide editing, image history versioning, full-screen presenter mode, and client-side export to editable PowerPoint (`pptxgenjs`) or PDF (`jspdf`).

### Step 4: Test & Deploy to Google Cloud (`click-to-deploy/`)

* **Local Verification**: Run `npm ci && npm run build` to verify TypeScript compilation and Vite bundling, or run `docker-compose up --build -d` with Application Default Credentials (`gcloud auth application-default login`).
* **Production Infrastructure (`click-to-deploy/main.tf`)**: Provisions Artifact Registry, Cloud SQL (PostgreSQL 15), Secret Manager secrets (`random_password` for DB password and JWT secret), a least-privilege Cloud Run runtime service account, and an External HTTPS Application Load Balancer with Serverless NEG and Identity-Aware Proxy (IAP).

## Pillar 1: Setup & Deployment Instructions

### 1.1 Prerequisites & IAM Permissions

* **GCP Environment:** An Argolis or standard Google Cloud project with billing enabled.
* **Required IAM Roles:** `roles/owner` (or granular `roles/run.admin`, `roles/cloudsql.admin`, `roles/artifactregistry.admin`, `roles/compute.loadBalancerAdmin`, `roles/iap.admin`, `roles/secretmanager.admin`, `roles/iam.serviceAccountAdmin`).
* **Required APIs:** `aiplatform.googleapis.com`, `artifactregistry.googleapis.com`, `cloudbuild.googleapis.com`, `compute.googleapis.com`, `iam.googleapis.com`, `iap.googleapis.com`, `logging.googleapis.com`, `run.googleapis.com`, `secretmanager.googleapis.com`, `serviceusage.googleapis.com`, `sqladmin.googleapis.com`.
* **Required Runtime Environment Variables (automatically wired by Terraform):**
  * `GOOGLE_GENAI_USE_VERTEXAI=true`
  * `GOOGLE_CLOUD_PROJECT=<your-project-id>`
  * `GOOGLE_CLOUD_LOCATION=global`
  * `GEMINI_MAIN_MODEL=gemini-3.7-flash`
  * `GEMINI_FLASH_MODEL=gemini-3.7-flash`
  * `GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview`
  * `DATABASE_URL` and `JWT_SECRET` (injected securely from Secret Manager)

### 1.2 Option A: One-Click Deployment via Demo Automation

1. Open the DeckMind demo listing and click **Deploy Demo (Click-to-Deploy)**.
2. Select your target Argolis organization, project, and region (`us-central1`).
3. Wait approximately **6–8 minutes** for Cloud SQL, Artifact Registry, Cloud Run, and the HTTPS Load Balancer to finish provisioning.

### 1.3 Option B: Manual CLI / Terraform Deployment

```bash
export PROJECT_ID="your-project-id"
export REGION="us-central1"

# 1. Build and push the container image to Artifact Registry
gcloud artifacts repositories create deckmind-repo \
  --repository-format=docker \
  --location="${REGION}" \
  --project="${PROJECT_ID}" || true

gcloud builds submit \
  --tag "${REGION}-docker.pkg.dev/${PROJECT_ID}/deckmind-repo/deckmind:latest" \
  --project="${PROJECT_ID}" .

# 2. Provision infrastructure with Terraform
cd click-to-deploy
terraform init
terraform apply \
  -var="project_id=${PROJECT_ID}" \
  -var="data_location=${REGION}" \
  -var="container_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/deckmind-repo/deckmind:latest"
```

### 1.4 Deployment Verification

Confirm the Cloud Run service is active and the health endpoint responds:

```bash
gcloud run services list --project="${PROJECT_ID}" --region="${REGION}"
terraform -chdir=click-to-deploy output -raw app_url
```

### 1.5 Teardown & Cost Cleanup

To avoid ongoing Cloud SQL and Load Balancer charges after your customer session:

```bash
cd click-to-deploy
terraform destroy \
  -var="project_id=${PROJECT_ID}" \
  -var="data_location=${REGION}"
```

## Pillar 2: How to Access the Demo

### 2.1 Retrieving Entry Point URLs

* **From Click-to-Deploy:** Open the `app_url` link from the deployment completion summary.
* **From Terraform CLI:** Run `terraform -chdir=click-to-deploy output -raw app_url` to retrieve the `https://<lb_ip>.sslip.io` (or custom domain) URL.

### 2.2 Credentials & Test Personas

* **Network & Identity Authentication:** Access the External HTTPS Load Balancer URL using a browser signed into your `@google.com` or Argolis account authorized by Identity-Aware Proxy (IAP). No VPN or SSH tunnel is required.
* **Initial Admin Setup (First Launch Only):** On first visit, DeckMind detects zero users in PostgreSQL (`/api/setup-status`) and displays the **Initial Admin Setup** screen. Create an admin account (e.g., username `presenter` and a temporary demo password).
* **Subsequent Visits:** Log in with your configured username and password on the **Login** screen, or use the **Admin Panel** (shield icon) to create additional demo presenter accounts.

### 2.3 Expected Initial Landing State

After signing in, confirm you see the **DeckMind Studio** workspace with:

1. A top navigation bar showing the deck title (`Untitled Presentation`), **Save**, **Decks**, **Style Config**, and **Admin/Logout** controls.
2. A **Style Configuration** panel (or chat interface) ready to extract a brand theme or start a new presentation.

## Demo Walkthrough (Pillar 3 & Pillar 4: Step-by-Step Walkthrough & Seller Talking Script)

### Opening Discovery Hook (Before Sharing Screen)

> **What to Say:** *"Many marketing and sales enablement teams tell us their subject-matter experts spend 6 to 10 hours building a single executive deck—researching current stats, wrestling with slide layouts, and hunting for on-brand visuals. Before we dive in, how long does it currently take your team to go from a rough brief to a customer-ready presentation?"*

### Step 1: Extract a Brand Style in Seconds

* **What to Do (Click Sequence):**
  1. Open the **Style Configuration** panel.
  2. In the **Extract Style from Brand / URL** field, enter `Google Cloud` (or the customer's own brand name).
  3. Click **Extract Style**, review the auto-populated color palette, typography, and mood, select **2K** image resolution, and click **Apply Style**.
* **Expected Visual Outcome:** The 4 color swatches, typography, and mood fields populate automatically from Gemini (`gemini-3.7-flash`), and the studio locks in a reusable visual system prompt for all subsequent slides.
* **What to Say (Seller Script):** *"Notice we don't start with a blank template. DeckMind uses Gemini to infer your brand's exact color hierarchy, typography, and visual mood in seconds—so every slide and generated image stays on-brand without manual formatting."*
* **Why Google Cloud:** *"All style reasoning and prompt synthesis run on Vertex AI with enterprise data governance—your brand guidelines and prompts never train public models."*

### Step 2: Research-Grounded Outlining (Multi-Agent Orchestration)

* **What to Do (Click Sequence):**
  1. In the **Chat Interface**, paste this exact tested prompt and click **Send**:

```text
Create a 6-slide executive briefing on Enterprise AI Adoption in Retail Supply Chains for 2026, including real-time inventory forecasting, multimodal store operations, and measurable ROI metrics.
```

  2. Wait ~5–10 seconds for the orchestrator to delegate to `search_agent` and return a structured 6-slide textual outline.
  3. Review the outline with the audience, then type `Looks great, please build the slides!` and click **Send**.
* **Expected Visual Outcome:** First, the chat displays a clean numbered outline (`Slide 1` through `Slide 6`) grounded in Google Search results and asks for confirmation. After approval, `deck_agent` populates the right-hand **Deck Preview** with 6 structured slides.
* **What to Say (Seller Script):** *"Instead of hallucinating generic bullets, DeckMind's orchestrator first dispatches a dedicated Search Agent grounded in Google Search to gather current facts, then pauses for human-in-the-loop outline approval before generating a single slide."*

### Step 3: High-Resolution Slide Image Generation & Mode Toggle

* **What to Do (Click Sequence):**
  1. In the **Deck Preview** pane, observe the background jobs generating 16:9 visuals for each slide (status transitions from `generating` to `completed`).
  2. Click any slide to inspect its visual, and demonstrate toggling between **Full Slide Image** and **Background Only** mode if editable text overlays are desired.
  3. Optionally type a targeted edit in chat, such as: `Make Slide 3 more visual with a 3-step data flow diagram.`
* **Expected Visual Outcome:** Each slide renders a crisp 16:9 Vertex AI generated visual tailored to the slide's content and the locked brand palette, with version history arrows to compare or revert iterations.
* **What to Say (Seller Script):** *"Every slide receives a custom 16:9 visual generated on Vertex AI—not recycled stock clip art. And if an executive wants to tweak one slide, you can iterate conversationally on that single slide without regenerating the entire deck."*

### Step 4: Present Live or Export to Editable PPTX / PDF

* **What to Do (Click Sequence):**
  1. Click **Present** in the preview toolbar to launch full-screen **Presenter View**, then press `Esc` to exit.
  2. Click **Export PPTX** (or **Export PDF**) to download the finished deck locally.
* **Expected Visual Outcome:** Full-screen presenter mode displays clean 16:9 slides with keyboard navigation; clicking **Export PPTX** downloads a standard `.pptx` file ready for PowerPoint or Google Slides.
* **What to Say (Seller Script):** *"You can present directly from DeckMind or export to an editable PowerPoint or PDF in one click—turning an afternoon of slide assembly into a 3-minute collaborative workflow."*

### Closing & Next-Step Transition

* **Common Customer Objection & Response:**
  * *Objection:* *"Can we restrict access to internal employees and keep our proprietary strategy decks private?"*
  * *Response:* *"Yes. DeckMind deploys inside your own Google Cloud project on Cloud Run behind Identity-Aware Proxy (IAP), persists decks in your private Cloud SQL instance, and calls Vertex AI using a least-privilege service account—your data never leaves your VPC/project boundary."*
* **Call to Action:** *"We can deploy this exact architecture into a sandbox project with your brand guidelines and sample briefs in a 2-hour hands-on workshop. Who from your enablement and cloud platform teams should we invite?"*

## Troubleshooting & Live-Demo Recovery Tips

* **Cold-Start Latency on First Request:** Cloud Run scales to zero when idle. Open the URL and run one style extraction 5 minutes before your customer call to warm up the container and Cloud SQL connection.
* **Model Quota or Availability in Fresh Projects:** If `gemini-3.1-flash-image-preview` or `gemini-3.7-flash` returns a quota or model-not-found error in a new Argolis project, check `GOOGLE_CLOUD_LOCATION=global` in Cloud Run environment variables and override `GEMINI_MAIN_MODEL` / `GEMINI_FLASH_MODEL` / `GEMINI_IMAGE_MODEL` if needed.
* **Browser Session / Unsaved State Recovery:** DeckMind automatically snapshots active slides, styles, and chat history to `localStorage` (`deckmind_rescue`) every few seconds. Refreshing the browser restores your in-progress deck even if the network blips.
* **Resetting Demo State:** Click **New Deck** (`+`) in the header to clear the current canvas and start a fresh customer pitch, or delete test decks from the **Decks** manager modal.
