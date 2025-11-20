# 🚀🧠 Deepagents UI

[Deepagents](https://github.com/langchain-ai/deepagents) is a simple, open source agent harness that implements a few generally useful tools, including planning (prior to task execution), computer access (giving the able access to a shell and a filesystem), and sub-agent delegation (isolated task execution). This is a UI for interacting with deepagents.

## 🚀 Quickstart

**Install dependencies and run the app**

```bash
$ git clone https://github.com/langchain-ai/deepagents-ui.git
$ cd deepagents-ui
$ yarn install
$ yarn dev
```

**Start the Thread Service (Required for Authentication)**

The thread service provides authentication and thread persistence. You need to start it before using OAuth or credentials login:

```bash
# From the root of the repository
cd thread_service

# Install dependencies
uv sync

# Set up environment (copy env.example to .env and configure)
cp env.example .env

# Start PostgreSQL (if not already running)
# Option 1: Using Docker Compose (recommended)
docker compose up -d db

# Option 2: Or use your own PostgreSQL instance
# Make sure it's running and update .env with your connection details

# Run database migrations
uv run alembic upgrade head

# Start the thread service
uv run python run.py
```

The thread service will start on:
- **HTTP API**: `http://localhost:8080`
- **gRPC**: `localhost:50051`

**Note**: If the thread service is not running, OAuth authentication will still work with NextAuth, but backend features (thread persistence, user management) will be unavailable.

**Deploy a deepagent**

As an example, see our [deepagents quickstart](https://github.com/langchain-ai/deepagents-quickstarts/tree/main/deep_research) repo for an example and run the `deep_research` example.

The `langgraph.json` file has the assistant ID as the key:

```
  "graphs": {
    "research": "./agent.py:agent"
  },
```

Kick off the local LangGraph deployment:

```bash
$ cd deepagents-quickstarts/deep_research
$ langgraph dev
```

You will see the local LangGraph deployment log to terminal:

```
╦  ┌─┐┌┐┌┌─┐╔═╗┬─┐┌─┐┌─┐┬ ┬
║  ├─┤││││ ┬║ ╦├┬┘├─┤├─┘├─┤
╩═╝┴ ┴┘└┘└─┘╚═╝┴└─┴ ┴┴  ┴ ┴

- 🚀 API: http://127.0.0.1:2024
- 🎨 Studio UI: https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024
- 📚 API Docs: http://127.0.0.1:2024/docs
...
```

You can get the Deployment URL and Assistant ID from the terminal output and `langgraph.json` file, respectively:

- Deployment URL: http://127.0.1:2024
- Assistant ID: `research`

**Open Deepagents UI** at [http://localhost:3000](http://localhost:3000) and input the Deployment URL and Assistant ID:

- **Deployment URL**: The URL for the LangGraph deployment you are connecting to
- **Assistant ID**: The ID of the assistant or agent you want to use
- [Optional] **LangSmith API Key**: Your LangSmith API key (format: `lsv2_pt_...`). This may be required for accessing deployed LangGraph applications. You can also provide this via the `NEXT_PUBLIC_LANGSMITH_API_KEY` environment variable.

**Usagee**

You can interact with the deployment via the chat interface and can edit settings at any time by clicking on the Settings button in the header.

<img width="2039" height="1495" alt="Screenshot 2025-11-17 at 1 11 27 PM" src="https://github.com/user-attachments/assets/50e1b5f3-a626-4461-9ad9-90347e471e8c" />

As the deepagent runs, you can see its files in LangGraph state.

<img width="2039" height="1495" alt="Screenshot 2025-11-17 at 1 11 36 PM" src="https://github.com/user-attachments/assets/86cc6228-5414-4cf0-90f5-d206d30c005e" />

You can click on any file to view it.

<img width="2039" height="1495" alt="Screenshot 2025-11-17 at 1 11 40 PM" src="https://github.com/user-attachments/assets/9883677f-e365-428d-b941-992bdbfa79dd" />

### Optional: Environment Variables

You can optionally set environment variables instead of using the settings dialog:

```env
# Required for NextAuth.js authentication
AUTH_SECRET="your-secret-key-here"

# Optional OAuth provider credentials
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# Optional: LangSmith and Thread Service
NEXT_PUBLIC_LANGSMITH_API_KEY="lsv2_xxxx"
NEXT_PUBLIC_THREAD_SERVICE_URL="http://127.0.0.1:8080"
```

**Note:** 
- `AUTH_SECRET` is **required** for NextAuth.js to work. Generate a secure random string (e.g., `openssl rand -base64 32`).
- Settings configured in the UI take precedence over environment variables. The optional `NEXT_PUBLIC_THREAD_SERVICE_URL` is used to sync conversations with the PostgreSQL thread service that ships with this repo.

### OAuth Setup (Google/GitHub)

To enable OAuth authentication, you need to:

1. **Create OAuth Apps:**
   - **Google**: Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create OAuth 2.0 Client ID
   - **GitHub**: Go to [GitHub Settings](https://github.com/settings/developers) → OAuth Apps → New OAuth App

2. **Configure Redirect URIs:**
   
   For **local development**, add these redirect URIs:
   - Google: `http://localhost:3000/api/auth/callback/google`
   - GitHub: `http://localhost:3000/api/auth/callback/github`
   
   For **production**, add:
   - Google: `https://yourdomain.com/api/auth/callback/google`
   - GitHub: `https://yourdomain.com/api/auth/callback/github`
   
   **Important**: The redirect URI must match exactly (including protocol, port, and path). If you're using a custom port, update the redirect URI accordingly (e.g., `http://localhost:3001/api/auth/callback/google`).

3. **Set Environment Variables:**
   ```env
   GOOGLE_CLIENT_ID="your-google-client-id"
   GOOGLE_CLIENT_SECRET="your-google-client-secret"
   GITHUB_CLIENT_ID="your-github-client-id"
   GITHUB_CLIENT_SECRET="your-github-client-secret"
   ```

4. **Optional: Custom Base URL**
   If your app runs on a different URL, set:
   ```env
   AUTH_URL="http://localhost:3000"  # or your custom URL
   ```

### Usage

You can run your Deep Agents in Debug Mode, which will execute the agent step by step. This will allow you to re-run the specific steps of the agent. This is intended to be used alongside the optimizer.

You can also turn off Debug Mode to run the full agent end-to-end.

### 📚 Resources

If the term "Deep Agents" is new to you, check out these videos!
[What are Deep Agents?](https://www.youtube.com/watch?v=433SmtTc0TA)
[Implementing Deep Agents](https://www.youtube.com/watch?v=TTMYJAw5tiA&t=701s)
