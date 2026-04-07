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

      const subjectMatch = rawEmail.match(/^Subject:\s*(.+)/im);
      const subject = subjectMatch ? subjectMatch[1].trim() : "No Subject";
      const fromMatch = rawEmail.match(/^From:\s*(.+)/im);
      let fromAddress = "unknown@sender.com";
      let fromName = "Unknown Sender";
      
      if (fromMatch) {
         const f = fromMatch[1].trim();
         const extract = f.match(/(.*)<([^>]+)>/);
         if (extract) {
            fromName = extract[1].replace(/"/g, '').trim();
            fromAddress = extract[2].trim();
         } else {
            fromAddress = f;
            fromName = f;
         }
      }

      const id = message.headers.get("Message-ID") || Date.now().toString();

      function decodePart(fullPartBlock) {
          const blockMatch = fullPartBlock.match(/^([\s\S]*?)\r?\n\r?\n([\s\S]*)$/);
          if (!blockMatch) return fullPartBlock;
          const headers = blockMatch[1];
          let body = blockMatch[2];

          if (headers.match(/Content-Transfer-Encoding:\s*base64/i)) {
             try {
                const b64 = body.replace(/\s+/g, '');
                const bin = atob(b64);
                const bytes = new Uint8Array(bin.length);
                for(let i=0; i<bin.length; i++) bytes[i] = bin.charCodeAt(i);
                return new TextDecoder('utf-8').decode(bytes);
             } catch(e) { return body; }
          }
          
          if (headers.match(/Content-Transfer-Encoding:\s*quoted-printable/i) || body.includes('=')) {
             let bytes = [];
             for (let i = 0; i < body.length; i++) {
                if (body[i] === '=' && i + 1 < body.length) {
                  if (body[i+1] === '\r' || body[i+1] === '\n') {
                    if (body[i+1] === '\r' && body[i+2] === '\n') i += 2;
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

      const textMatch = rawEmail.match(/(Content-Type:\s*text\/plain[^]*?)(?=\r?\n--[a-zA-Z0-9_\-]+|$)/i);
      if (textMatch) bodyPart = decodePart(textMatch[1]);

      const htmlMatch = rawEmail.match(/(Content-Type:\s*text\/html[^]*?)(?=\r?\n--[a-zA-Z0-9_\-]+|$)/i);
      if (htmlMatch) htmlPart = decodePart(htmlMatch[1]);

      if (!bodyPart && !htmlPart) {
          bodyPart = rawEmail.split(/\r?\n\r?\n/).slice(1).join("\n\n").trim();
      }

      const snippet = bodyPart ? bodyPart.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g,' ').slice(0, 160).trim() : "No message text.";

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
        messages.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
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
        } catch(e) {}
        
        if (!reqAddress) return new Response(JSON.stringify({ ok: true }), { headers });

        const reqPrefix = `msg:${reqAddress.toLowerCase()}:`;
        const list = await env.TEMP_MAIL_KV.list({ prefix: reqPrefix });
        for (const key of list.keys) {
          await env.TEMP_MAIL_KV.delete(key.name);
        }
        return new Response(JSON.stringify({ ok: true }), { headers });
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
        } catch(e) {}
        
        return new Response(JSON.stringify({ 
            address: `${prefix}@sumitbuilds.tech`, 
            mode: "cloudflare", 
            createdAt: new Date().toISOString() 
        }), { headers });
      }
      
    } catch(err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ error: "Not Found or API mismatch" }), { status: 404, headers });
  }
};
