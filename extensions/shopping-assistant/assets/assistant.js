(function () {
  const root = document.getElementById("ai-shopping-assistant-root");
  if (!root) return;

  let isOpen = false;
  let messages = [
    {
      role: "assistant",
      text: "Hi! I can help you find the right product fast — or show best-value picks if you're not sure yet.",
      products: [],
      filters: null,
      cta: null,
    },
  ];

  const state = {
    query: "",
    loading: false,
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function saveMessages() {
    sessionStorage.setItem("ai_assistant_messages", JSON.stringify(messages));
  }

  function loadMessages() {
    const raw = sessionStorage.getItem("ai_assistant_messages");
    if (!raw) return;

    try {
      messages = JSON.parse(raw);
    } catch (error) {
      messages = [
        {
          role: "assistant",
          text: "Hi! I can help you find the right product fast — or show best-value picks if you're not sure yet.",
          products: [],
          filters: null,
          cta: null,
        },
      ];
    }
  }

  function scrollMessagesToBottom() {
    const box = document.getElementById("assistant-messages");
    if (box) box.scrollTop = box.scrollHeight;
  }

  async function getCartItems() {
    try {
      const response = await fetch("/cart.js", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return [];
      const cart = await response.json();
      return Array.isArray(cart.items)
        ? cart.items.map((item) => ({
            product_title: item.product_title,
            variant_title: item.variant_title,
            quantity: item.quantity,
            price: item.price,
          }))
        : [];
    } catch (error) {
      return [];
    }
  }

  async function addToCart(variantId) {
    const response = await fetch("/cart/add.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        items: [{ id: Number(variantId), quantity: 1 }],
      }),
    });

    const rawText = await response.text();
    let data = {};

    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (error) {
      throw new Error("Cart response was not valid JSON");
    }

    if (!response.ok) {
      throw new Error(data.description || data.message || "Failed to add to cart");
    }

    return data;
  }

  async function askAssistant(query) {
    state.loading = true;
    render();

    try {
      const cartItems = await getCartItems();

      const response = await fetch("/apps/recommend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query,
          messages,
          cartItems,
        }),
      });

      const rawText = await response.text();
      let data = {};

      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch (error) {
        throw new Error("Server did not return valid JSON. Raw response: " + rawText);
      }

      if (!response.ok) {
        throw new Error(
          data && data.error
            ? `${data.error} (HTTP ${response.status})`
            : `HTTP ${response.status}. Raw response: ${rawText || "[empty]"}`
        );
      }

      messages.push({
        role: "assistant",
        text: data.reply || "Here are some strong options for you.",
        products: data.products || [],
        filters: data.filters || null,
        cta: data.cta || null,
      });

      saveMessages();
    } catch (error) {
      messages.push({
        role: "assistant",
        text: "Sorry, something went wrong: " + error.message,
        products: [],
        filters: null,
        cta: null,
      });
      saveMessages();
    } finally {
      state.loading = false;
      render();
      scrollMessagesToBottom();
    }
  }

  function sendMessage(prefill) {
    const outgoing = typeof prefill === "string" ? prefill : state.query.trim();
    if (!outgoing || state.loading) return;

    messages.push({
      role: "user",
      text: outgoing,
      products: [],
      filters: null,
      cta: null,
    });

    state.query = "";
    saveMessages();
    render();
    scrollMessagesToBottom();
    askAssistant(outgoing);
  }

  function renderFilters(filters) {
    if (!filters) return "";

    return `
      <div style="
        margin-top:10px;
        padding:10px;
        background:#eef2ff;
        border-radius:10px;
        font-size:13px;
        color:#111827;
      ">
        <strong>Understood:</strong>
        <div>Activity: ${escapeHtml(filters.activity || "None")}</div>
        <div>Product: ${escapeHtml(filters.productType || "None")}</div>
        <div>Color: ${escapeHtml(filters.color || "None")}</div>
        <div>Budget: ${
          filters.maxPrice !== null && filters.maxPrice !== undefined
            ? escapeHtml(filters.maxPrice)
            : "None"
        }</div>
        <div>Stage: ${escapeHtml(filters.stage || "browse")}</div>
        <div>Objection: ${escapeHtml(filters.objection || "None")}</div>
      </div>
    `;
  }

  function renderProducts(products) {
    if (!products || !products.length) return "";

    return `
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:12px;">
        ${products.map((p) => {
          const title = escapeHtml(p.title);
          const image = escapeHtml(p.image || "https://via.placeholder.com/80");
          const price = escapeHtml(p.price || "");
          const compareAtPrice = escapeHtml(p.compareAtPrice || "");
          const variantId = escapeHtml(p.variantId || "");
          const handle = escapeHtml(p.handle || "");
          const inventory = Number(p.totalInventory || 0);

          return `
            <div style="
              display:flex;
              gap:10px;
              background:white;
              border:1px solid #e5e7eb;
              border-radius:12px;
              padding:10px;
            ">
              <img
                src="${image}"
                alt="${title}"
                style="width:80px;height:80px;object-fit:cover;border-radius:10px;flex-shrink:0;"
              />
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;color:#111827;">${title}</div>
                <div style="font-size:14px;color:#111827;">
                  ${compareAtPrice ? `<span style="text-decoration:line-through;color:#6b7280;margin-right:6px;">${compareAtPrice}</span>` : ""}
                  <span>💰 ${price}</span>
                </div>
                ${
                  inventory > 0 && inventory <= 5
                    ? `<div style="font-size:12px;color:#b45309;margin-top:4px;">Low stock</div>`
                    : ""
                }
                ${
                  handle
                    ? `<div style="font-size:12px;color:#6b7280;margin-top:4px;">${handle}</div>`
                    : ""
                }
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                  <button
                    class="assistant-add-to-cart"
                    data-variant-id="${variantId}"
                    style="
                      padding:8px 10px;
                      border:none;
                      border-radius:8px;
                      background:#111827;
                      color:white;
                      cursor:pointer;
                    "
                  >
                    Add to cart
                  </button>
                  ${
                    handle
                      ? `<a
                          href="/products/${handle}"
                          style="
                            padding:8px 10px;
                            border-radius:8px;
                            border:1px solid #d1d5db;
                            color:#111827;
                            text-decoration:none;
                          "
                        >View</a>`
                      : ""
                  }
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderQuickPrompts() {
    const prompts = [
      "Show me ski gloves under 100",
      "What is the best-value ski gift?",
      "I need a cheaper option",
      "What should I add with this?",
    ];

    return `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
        ${prompts.map((prompt) => `
          <button
            class="assistant-prompt"
            data-prompt="${escapeHtml(prompt)}"
            style="
              border:1px solid #d1d5db;
              background:#fff;
              border-radius:999px;
              padding:8px 10px;
              font-size:12px;
              cursor:pointer;
            "
          >${escapeHtml(prompt)}</button>
        `).join("")}
      </div>
    `;
  }

  function renderCTA(cta) {
    if (!cta) return "";
    return `
      <div style="
        margin-top:10px;
        padding:10px 12px;
        border-radius:10px;
        background:#ecfccb;
        color:#365314;
        font-size:13px;
        font-weight:600;
      ">
        ${escapeHtml(cta)}
      </div>
    `;
  }

  function renderMessages() {
    return messages.map((m) => {
      const text = escapeHtml(m.text || "");
      const bubbleBg = m.role === "user" ? "#111827" : "#e5e7eb";
      const bubbleColor = m.role === "user" ? "white" : "#111827";
      const justify = m.role === "user" ? "flex-end" : "flex-start";

      return `
        <div style="margin-bottom:16px;">
          <div style="display:flex;justify-content:${justify};">
            <div style="
              max-width:80%;
              padding:10px 14px;
              border-radius:14px;
              background:${bubbleBg};
              color:${bubbleColor};
              white-space:pre-wrap;
              word-break:break-word;
            ">
              ${text}
            </div>
          </div>

          ${m.role === "assistant" ? renderCTA(m.cta) : ""}
          ${m.role === "assistant" ? renderFilters(m.filters) : ""}
          ${m.role === "assistant" ? renderProducts(m.products) : ""}
        </div>
      `;
    }).join("");
  }

  function render() {
    root.innerHTML = `
      <button
        id="assistant-toggle"
        style="
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 72px;
          height: 72px;
          border-radius: 999px;
          border: none;
          background: #111827;
          color: white;
          font-size: 30px;
          cursor: pointer;
          z-index: 9999;
          box-shadow: 0 8px 24px rgba(0,0,0,.25);
        "
        aria-label="Open shopping assistant"
        title="Open shopping assistant"
      >💬</button>

      ${
        isOpen
          ? `
        <div
          style="
            position: fixed;
            bottom: 110px;
            right: 24px;
            width: 390px;
            height: 600px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 12px 40px rgba(0,0,0,.2);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            z-index: 9999;
            font-family: Arial, sans-serif;
          "
        >
          <div
            style="
              background:#111827;
              color:white;
              padding:14px 16px;
              display:flex;
              justify-content:space-between;
              align-items:center;
            "
          >
            <div>
              <strong>Shopping Assistant</strong>
              <div style="font-size:12px;opacity:.85;">Find the right product faster</div>
            </div>
            <button
              id="assistant-close"
              style="background:none;border:none;color:white;font-size:22px;cursor:pointer;"
              aria-label="Close assistant"
            >×</button>
          </div>

          <div
            id="assistant-messages"
            style="
              flex:1;
              overflow:auto;
              padding:16px;
              background:#f9fafb;
            "
          >
            ${renderMessages()}
            ${messages.length <= 1 ? renderQuickPrompts() : ""}
            ${
              state.loading
                ? `<div style="color:#6b7280;font-size:14px;margin-top:12px;">Assistant is thinking...</div>`
                : ""
            }
          </div>

          <div
            style="
              border-top:1px solid #e5e7eb;
              padding:12px;
              display:flex;
              gap:8px;
              background:white;
            "
          >
            <input
              id="assistant-input"
              value="${escapeHtml(state.query)}"
              placeholder="Ask for products, budget picks, or cheaper alternatives"
              style="
                flex:1;
                padding:10px;
                border-radius:10px;
                border:1px solid #d1d5db;
              "
            />
            <button
              id="assistant-send"
              ${state.loading ? "disabled" : ""}
              style="
                padding:10px 14px;
                border:none;
                border-radius:10px;
                background:${state.loading ? "#9ca3af" : "#111827"};
                color:white;
                cursor:${state.loading ? "not-allowed" : "pointer"};
              "
            >${state.loading ? "..." : "Send"}</button>
          </div>
        </div>
      `
          : ""
      }
    `;

    const toggle = document.getElementById("assistant-toggle");
    if (toggle) {
      toggle.onclick = function () {
        isOpen = !isOpen;
        render();
        setTimeout(scrollMessagesToBottom, 0);
      };
    }

    const close = document.getElementById("assistant-close");
    if (close) {
      close.onclick = function () {
        isOpen = false;
        render();
      };
    }

    const input = document.getElementById("assistant-input");
    if (input) {
      input.oninput = function (e) {
        state.query = e.target.value;
      };
      input.onkeydown = function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          sendMessage();
        }
      };
    }

    const send = document.getElementById("assistant-send");
    if (send) {
      send.onclick = function () {
        sendMessage();
      };
    }

    document.querySelectorAll(".assistant-prompt").forEach((button) => {
      button.onclick = function () {
        const prompt = button.getAttribute("data-prompt");
        if (prompt) sendMessage(prompt);
      };
    });

    document.querySelectorAll(".assistant-add-to-cart").forEach((button) => {
      button.onclick = async function () {
        const variantId = button.getAttribute("data-variant-id");

        if (!variantId) {
          button.textContent = "Unavailable";
          button.disabled = true;
          return;
        }

        button.disabled = true;
        button.textContent = "Adding...";

        try {
          await addToCart(variantId);
          button.textContent = "Added ✓";

          setTimeout(() => {
            button.textContent = "Add to cart";
            button.disabled = false;
          }, 1500);
        } catch (error) {
          button.textContent = "Failed";

          setTimeout(() => {
            button.textContent = "Add to cart";
            button.disabled = false;
          }, 1500);
        }
      };
    });
  }

  loadMessages();
  render();
})();