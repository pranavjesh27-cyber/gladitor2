# Chennai Voice agent setup

The lightweight browser voice widget in this folder is the voice interface used by the Chennai Voice site. Its assistant.js stays here as the source file; the Next.js app serves it from /api/agent-widget and imports assistant.css directly.

The agent speaks route search rather than making bookings. A voice query goes to the same-origin /api/chat adapter, which uses the /api/search GTFS route engine. The widget sends results to the page so the feed-backed journey cards update. The browser Speech Recognition API handles microphone input when available. Groq is used only for the recorded-audio fallback. Browser speech synthesis reads answers aloud.

## Start the site

Run these commands in PowerShell from the project root, one level above this folder:

```powershell
Set-Location "C:\Users\Pranav\Desktop\projects folder\hackthon srm"
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000 in Chrome or Edge. Keep the terminal running while using the site. Run npm run dev from the project root, not from agent folder.

Typed searches and the local demonstration routes work without provider credentials. To enable the recorded-audio fallback, set GROQ_API_KEY in the project root .env.local and restart the server. The browser asks for microphone permission after you tap the voice control. Browser speech recognition availability depends on the browser.

## Files

- assistant.js — original lightweight voice widget adapted to Tamil and English route search.
- assistant.css — widget styles, loaded by the Next.js app.
- env.example — optional provider settings; copy the project root .env.example to .env.local for the live app.
- requirements.txt and test_cli.py — retained from the earlier standalone booking prototype; the Chennai Voice web app does not need its Python server.

## Local browser troubleshooting

- If the page shows a connection error, confirm npm run dev is still running and says it is ready at http://localhost:3000.
- Use Chrome or Edge on the same Windows machine. A browser embedded in another app may not be able to reach that machine's localhost.
- If microphone access is blocked, allow it for localhost in the browser address bar. Typed route search remains available.
- If browser speech recognition is unavailable, configure GROQ_API_KEY for recorded transcription fallback.
- No ticket is booked and no WhatsApp message is sent by this app.

Route cards use static GTFS stop sequences and scheduled ride segments. The feeds do not provide fares, live arrivals, or transfer waiting times; confirm current service details with the operator.
