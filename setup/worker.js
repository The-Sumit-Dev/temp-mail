function decodeMimeHeader(text) {
  if (!text) return "";
  text = text.replace(/\r?\n\s+/g, ' ');
  text = text.replace(/\?=\s+=\?/g, '?==?');
  return text.replace(/=\?([A-Za-z0-9\-_]+)\?([BbQq])\?([^\?]+)\?=/g, (match, charset, encoding, data) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        const bin = atob(data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder(charset).decode(bytes);
      } else if (encoding.toUpperCase() === 'Q') {
        let bytes = [];
        const body = data.replace(/_/g, ' ');
        for (let i = 0; i < body.length; i++) {
          if (body[i] === '=' && i + 2 < body.length) {
            const hex = body.slice(i + 1, i + 3);
            bytes.push(parseInt(hex, 16));
            i += 2;
          } else {
            bytes.push(body.charCodeAt(i));
          }
        }
        return new TextDecoder(charset).decode(new Uint8Array(bytes));
      }
    } catch (e) { return match; }
    return match;
  });
}

export default {
  // =======================================================
  // 1. EVENT: RECEIVE EMAILS
  // =======================================================
  async email(message, env, ctx) {
    if (!env.TEMP_MAIL_KV) {
      console.log("No TEMP_MAIL_KV bound. Cannot save email.");
      return;
    }

    try {
      const reader = message.raw.getReader();
      const decoder = new TextDecoder("utf-8");
      let rawEmail = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        rawEmail += decoder.decode(value);
      }

      const subject = decodeMimeHeader(message.headers.get("Subject") || "No Subject");
      const rawFrom = message.headers.get("From") || "";
      let fromAddress = "unknown@sender.com";
      let fromName = "Unknown Sender";

      if (rawFrom) {
        const extract = rawFrom.match(/(.*)<([^>]+)>/);
        if (extract) {
          fromName = decodeMimeHeader(extract[1].replace(/"/g, '').trim()) || extract[2].trim();
          fromAddress = extract[2].trim();
        } else {
          fromAddress = rawFrom.trim();
          fromName = decodeMimeHeader(rawFrom.trim());
        }
      }

      const id = message.headers.get("Message-ID") || Date.now().toString();

      function decodePart(fullPartBlock) {
        const splitIdx = fullPartBlock.search(/\r?\n\r?\n/);
        let headers = "";
        let body = fullPartBlock;

        if (splitIdx !== -1) {
          headers = fullPartBlock.slice(0, splitIdx);
          body = fullPartBlock.slice(splitIdx).trimStart();
        }

        if (headers.match(/Content-Transfer-Encoding:\s*base64/i)) {
          try {
            const b64 = body.replace(/\s+/g, '');
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new TextDecoder('utf-8').decode(bytes);
          } catch (e) { return body; }
        }

        if (headers.match(/Content-Transfer-Encoding:\s*quoted-printable/i)) {
          let bytes = [];
          for (let i = 0; i < body.length; i++) {
            if (body[i] === '=' && i + 1 < body.length) {
              if (body[i + 1] === '\r' || body[i + 1] === '\n') {
                if (body[i + 1] === '\r' && body[i + 2] === '\n') i += 2;
                else i += 1;
                continue;
              }
              let hex = body.slice(i + 1, i + 3);
              if (/^[0-9a-fA-F]{2}$/.test(hex)) {
                bytes.push(parseInt(hex, 16));
                i += 2;
                continue;
              }
            }
            bytes.push(body.charCodeAt(i));
          }
          return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
        }
        return body;
      }

      let bodyPart = "";
      let htmlPart = "";

      const contentType = message.headers.get("Content-Type") || "";
      const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
      const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : null;

      let blocks = [];
      if (boundary) {
        blocks = rawEmail.split("--" + boundary);
      } else {
        blocks = rawEmail.split(/\r?\n--[a-zA-Z0-9_\-\.\=\+]+/);
      }

      for (const block of blocks) {
        const cleanBlock = block.trimStart();
        if (!htmlPart && /Content-Type:\s*text\/html/i.test(cleanBlock)) {
          htmlPart = decodePart(cleanBlock);
        } else if (!bodyPart && /Content-Type:\s*text\/plain/i.test(cleanBlock)) {
          bodyPart = decodePart(cleanBlock);
        }
      }

      if (!bodyPart && !htmlPart) {
        const parts = rawEmail.split(/\r?\n\r?\n/);
        if (parts.length > 1) {
          bodyPart = parts.slice(1).join("\n\n").trim();
        } else {
          bodyPart = rawEmail.trim();
        }
      }

      const snippetSource = bodyPart || (htmlPart ? htmlPart.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>?/gm, ' ') : "");
      const snippet = snippetSource.replace(/https?:\/\/[^\s]+/g, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').slice(0, 160).trim() || "No message text.";

      const emailData = {
        id: id,
        subject: subject,
        intro: snippet,
        text: bodyPart,
        html: htmlPart || `<div><pre>${bodyPart}</pre></div>`,
        from: { address: fromAddress, name: fromName },
        to: [{ address: message.to }],
        createdAt: new Date().toISOString()
      };

      // Ensure address is uniformly lowercased for exact matching
      const destAddress = (message.to || "catchall@sumitbuilds.tech").toLowerCase();
      const storageKey = `msg:${destAddress}:${Date.now()}:${id}`;

      await env.TEMP_MAIL_KV.put(storageKey, JSON.stringify(emailData), {
        expirationTtl: 86400
      });

    } catch (err) {
      console.log("Error processing email: ", err);
    }
  },

  // =======================================================
  // 2. EVENT: HTTP API FETCH
  // =======================================================
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (method === "OPTIONS") return new Response(JSON.stringify({ ok: true }), { headers });

    if (!env.TEMP_MAIL_KV) {
      return new Response(JSON.stringify({ error: "TEMP_MAIL_KV is not bound" }), { status: 500, headers });
    }

    try {
      const address = url.searchParams.get("address") || "";
      const queryPrefix = address ? `msg:${address.toLowerCase()}:` : "msg:";

      if (method === "GET" && url.pathname === "/api/messages") {
        if (!address) return new Response(JSON.stringify({ messages: [] }), { headers });
        const list = await env.TEMP_MAIL_KV.list({ prefix: queryPrefix });
        const messages = [];
        for (const key of list.keys) {
          const data = await env.TEMP_MAIL_KV.get(key.name, "json");
          if (data) messages.push(data);
        }
        messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return new Response(JSON.stringify({ messages }), { headers });
      }

      if (method === "GET" && url.pathname.startsWith("/api/messages/")) {
        const pathParts = url.pathname.split("/");
        const id = decodeURIComponent(pathParts[pathParts.length - 1]);
        const list = await env.TEMP_MAIL_KV.list({ prefix: queryPrefix });
        for (const key of list.keys) {
          if (key.name.endsWith(id)) {
            const data = await env.TEMP_MAIL_KV.get(key.name, "json");
            return new Response(JSON.stringify(data), { headers });
          }
        }
        return new Response(JSON.stringify({ error: "Message not found" }), { status: 404, headers });
      }

      if (method === "POST" && url.pathname === "/api/messages/purge") {
        let reqAddress = address;
        try {
          const bodyStr = await request.text();
          if (bodyStr) {
            const b = JSON.parse(bodyStr);
            if (b.address) reqAddress = b.address;
          }
        } catch (e) { }

        if (!reqAddress) return new Response(JSON.stringify({ ok: true }), { headers });

        const reqPrefix = `msg:${reqAddress.toLowerCase()}:`;
        const list = await env.TEMP_MAIL_KV.list({ prefix: reqPrefix });
        for (const key of list.keys) {
          await env.TEMP_MAIL_KV.delete(key.name);
        }
        return new Response(JSON.stringify({ ok: true }), { headers });
      }

      if (method === "POST" && url.pathname === "/api/messages/delete") {
        let reqAddress = address;
        let messageId = "";
        try {
          const bodyStr = await request.text();
          if (bodyStr) {
            const b = JSON.parse(bodyStr);
            if (b.address) reqAddress = b.address;
            if (b.id) messageId = b.id;
          }
        } catch (e) { }

        if (!reqAddress || !messageId) return new Response(JSON.stringify({ error: "Missing address or id" }), { status: 400, headers });

        const reqPrefix = `msg:${reqAddress.toLowerCase()}:`;
        const list = await env.TEMP_MAIL_KV.list({ prefix: reqPrefix });
        for (const key of list.keys) {
          if (key.name.endsWith(messageId)) {
            await env.TEMP_MAIL_KV.delete(key.name);
            return new Response(JSON.stringify({ ok: true }), { headers });
          }
        }
        return new Response(JSON.stringify({ error: "Message not found" }), { status: 404, headers });
      }

      if (method === "GET" && (url.pathname === "/api/account" || url.pathname === "/health")) {
        return new Response(JSON.stringify({
          address: "worker-active@sumitbuilds.tech",
          mode: "cloudflare",
          createdAt: new Date().toISOString()
        }), { headers });
      }

      if (method === "POST" && (url.pathname === "/api/account/new" || url.pathname === "/api/account/custom")) {
        let prefix = Math.random().toString(36).substring(2, 10);
        try {
          const bodyStr = await request.text();
          if (bodyStr) {
            const b = JSON.parse(bodyStr);
            if (b.prefix) prefix = b.prefix;
          }
        } catch (e) { }

        return new Response(JSON.stringify({
          address: `${prefix}@sumitbuilds.tech`,
          mode: "cloudflare",
          createdAt: new Date().toISOString()
        }), { headers });
      }

      if (method === "POST" && url.pathname === "/api/ai/summarize") {
        let prompt = "";
        try {
          const b = await request.json();
          prompt = b.prompt;
        } catch (e) { }

        if (!prompt) return new Response(JSON.stringify({ error: "No prompt" }), { status: 400, headers });

        const OLLAMA_API_KEY = '0e3942573eaa4e61998bd3c7f76a2ca5.AvWnxIWBUkYym5RcS4whwzIn';
        
        // We will try these models in order until one works (Best to Best)
        const modelsToTry = [
            "deepseek-v3.1:671b-cloud",
            "qwen3-coder:480b-cloud",
            "gpt-oss:120b-cloud",
            "gpt-oss:20b-cloud",
            "qwen2.5:cloud"
        ];
        let lastError = "";

        for (const targetModel of modelsToTry) {
          try {
            const aiResponse = await fetch('https://ollama.com/api/chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OLLAMA_API_KEY}`
              },
              body: JSON.stringify({
                model: targetModel,
                messages: [{ role: 'user', content: prompt }],
                stream: false
              })
            });

            if (aiResponse.ok) {
              const data = await aiResponse.json();
              return new Response(JSON.stringify({ content: data.message?.content || "", model: targetModel }), { headers });
            } else {
              const errText = await aiResponse.text();
              lastError += `[${targetModel}]: ${aiResponse.status} ${errText.slice(0, 50)}... `;
            }
          } catch (e) {
            lastError += `[${targetModel}]: Fetch failed: ${e.message} `;
          }
        }

        // If native API failed for all models, try V1 completions as final fallback
        try {
          const v1Response = await fetch('https://ollama.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OLLAMA_API_KEY}`
            },
            body: JSON.stringify({
              model: "gpt-oss:120b",
              messages: [{ role: 'user', content: prompt }],
              stream: false
            })
          });

          if (v1Response.ok) {
            const v1Data = await v1Response.json();
            return new Response(JSON.stringify({ content: v1Data.choices?.[0]?.message?.content || "", model: "gpt-oss:120b-v1" }), { headers });
          } else {
            const v1Err = await v1Response.text();
            lastError += `[v1-fallback]: ${v1Response.status} ${v1Err.slice(0, 50)}`;
          }
        } catch (e) {
          lastError += `[v1-fallback]: Fetch failed: ${e.message}`;
        }

        return new Response(JSON.stringify({ 
          error: "All AI models failed to respond", 
          details: lastError 
        }), { status: 502, headers });
      }

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ error: "Not Found or API mismatch" }), { status: 404, headers });
  }
};
