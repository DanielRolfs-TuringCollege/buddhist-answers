This is the project for Sprint 2, where you bring together LangChain, RAG, function calling, and vector databases to build a specialised, domain-focused chatbot. Unlike the Sprint 1 project, this one requires advanced RAG with query translation, tool calling for practical tasks, and a polished user interface. The result should be something that provides real value in a specific domain, and the architectural patterns you use here will carry directly into Sprint 3's autonomous agents.

### Topics

- Advanced RAG Implementation
- Tool Calling
- ChatGPT
- Prompt Engineering
- Streamlit / Next.js
- LangChain
- Vector Databases

### Prerequisites

- Python / TypeScript knowledge
- Knowledge of ChatGPT and the OpenAI SDK (used here via OpenRouter)
- Basic knowledge of Streamlit / Next.js
- Understanding of RAG concepts from Parts 2 and 3
- Familiarity with tool calling

**Estimated time to complete:** 20-25 hours

---

## Table of contents

- [Task description](#task-description)
- [Task requirements](#task-requirements)
  - [Core requirements](#core-requirements)
- [Optional tasks](#optional-tasks)
  - [Easy](#easy)
  - [Medium](#medium)
  - [Hard](#hard)
- [Evaluation criteria](#evaluation-criteria)
- [Creating the web app](#creating-the-web-app)

---

## Task description

This project represents a significant step up from basic chatbot implementation. You will create a specialised chatbot that leverages advanced RAG techniques and tool calling to provide domain-specific assistance. The goal is to build something that could be valuable in a real-world context.

**We will be using LangChain, your framework (Streamlit or Next.js) of choice, and implementing advanced RAG techniques.**

**The intended code editor for this project is [VS Code](https://code.visualstudio.com/).**

Your chatbot will:

1. Implement advanced RAG with query translation and structured retrieval
2. Include tool calling capabilities for practical tasks
3. Focus on a specific domain or use case
4. Provide detailed, context-aware responses

Example use cases (but feel free to create your own):

- Career Consultant Bot: Uses World Economic Forum reports and job market data to provide career advice
- Technical Documentation Assistant: Helps developers understand and work with specific frameworks or libraries
- Financial Advisor Bot: Analyses market trends and provides investment insights
- Healthcare Information Assistant: Provides accurate medical information from verified sources
- Legal Research Assistant: Helps with legal queries using case law and legal documents

---

## Task requirements

### Core requirements

1. **RAG Implementation:**
   - Create a knowledge base relevant to your domain
   - Implement standard document retrieval with embeddings
   - Use chunking strategies and similarity search
2. **Tool Calling:**
   - Implement at least 3 different tool calls
   - Functions should be relevant to your domain
   - Examples: data analysis, calculations, API integrations
3. **Domain Specialisation:**
   - Choose a specific domain or use case
   - Create a focused knowledge base
   - Implement domain-specific prompts and responses
   - Add relevant security measures for your domain
4. **Technical Implementation:**
   - Use LangChain with OpenRouter (OpenAI-compatible SDK) for LLM integration
   - Implement proper error handling
   - Include user input validation
5. **User Interface:**
   - Create an intuitive interface using Streamlit or Next.js
   - Show relevant context and sources
   - Display tool call results
   - Include progress indicators for long operations

---

## Optional tasks

After the main functionality is implemented and your code works correctly, and you feel that you want to upgrade your project, choose one or more improvements from this list. The list is sorted by difficulty level.

**Caution: Some of the tasks in medium or hard categories may involve concepts or libraries that are introduced in later sections or even require outside knowledge/time to research outside of the course.**

### Easy

1. Add conversation history and export functionality
2. Add visualisation of RAG process
3. Include source citations in responses
4. Add an interactive help feature or chatbot guide

### Medium

1. Implement multi-model support (OpenAI, Anthropic, etc.)
2. Add real-time data updates to knowledge base
3. Protect your app against prompt injection
4. Add user authentication and personalisation
5. Calculate and display token usage and costs
6. Add visualisation of tool call results
7. Implement conversation export in various formats (PDF, CSV, JSON)
8. Connect to tools from a publicly available remote MCP server
9. Implement rate limiting and API key management
10. Add logging and monitoring

### Hard

1. Employ hybrid search
2. Implement A/B testing for different RAG strategies
3. Add automated knowledge base updates
4. Add multi-language support
5. Implement advanced analytics dashboard
6. Implement your tools (functions) as MCP servers
7. Implement an evaluation of your RAG system, using RAGAs or otherwise

---

## Evaluation criteria

- **Understanding Core Concepts:**
  - The learner understands the basic principles of how RAG works
  - The learner can explain tool calling implementation clearly
  - The learner demonstrates good code organisation practices
  - The learner can identify potential error scenarios and edge cases
- **Technical Implementation:**
  - The learner knows how to use a front-end library using their knowledge and/or external resources
  - The learner's project works as intended; you can chat with a chatbot and get answers
  - The learner has created a relevant knowledge base for their domain
  - The learner has implemented appropriate security considerations
- **Reflection and Improvement:**
  - The learner understands the potential problems with the application
  - The learner can offer suggestions on improving the code and the project
- **Bonus Points:**
  - For maximum points, the learner should implement at least 2 medium and 1 hard optional task.

---

## Creating the web app

There are a number of ways we can choose to develop our application; here's some information about a few frameworks we recommend:

### Python track: Streamlit

### JavaScript track: Next.js

**How to use Next.js for RAG (for JS developers)**

You can either choose one of the following:

- Next.js from scratch, either `create-next-app` or the project template from the previous project
- [LangChain's Next.js template](https://github.com/langchain-ai/langchain-nextjs-template) with some RAG functionality
- some other JS full-stack framework or a Python backend + JS frontend project

> Note: As of October 2025, the Next.js template is outdated for LangChain v1. If you choose to use it, you will have to update the functionality to support the LangChain v1 interfaces taught in this module

Since this is not your first project and we expect you to have some TypeScript experience, we believe you do not need much hand-holding to get started. However, if you need help, you can always ask your peers or JTLs for help.
