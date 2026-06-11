/** ZuckPay direct checkout (USD card + Apple Pay via Stripe). */

const ZUCKPAY_API_BASE = 'https://www.zuckpay.com.br/conta/v3';

export function getZuckPayCredentials() {
  return {
    clientId: String(process.env.ZUCKPAY_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.ZUCKPAY_CLIENT_SECRET || '').trim(),
  };
}

function zuckPayAuthHeader() {
  const { clientId, clientSecret } = getZuckPayCredentials();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

export async function zuckPayApi(path, { method = 'GET', body } = {}) {
  const { clientId, clientSecret } = getZuckPayCredentials();
  const headers = {
    Authorization: zuckPayAuthHeader(),
    Accept: 'application/json',
  };
  const init = { method, headers, redirect: 'manual' };
  if (body != null) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      ...body,
    });
  }
  const res = await fetch(`${ZUCKPAY_API_BASE}${path}`, init);
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    throw new Error(
      `ZuckPay API redirected (${res.status})${location ? ` to ${location}` : ''}. Check ZUCKPAY_API_BASE.`
    );
  }
  return res;
}

const escapeHtml = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const escapeForJs = (s) =>
  String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/`/g, '\\`')
    .replace(/\r/g, '')
    .replace(/\n/g, '');

export function publicOrigin(req) {
  const host = req.get('host') || '';
  let proto = req.get('x-forwarded-proto');
  if (proto) proto = String(proto).split(',')[0].trim();
  else proto = req.protocol;
  if (proto !== 'http' && proto !== 'https') proto = 'https';
  return `${proto}://${host}`;
}

function sameOriginUrl(candidate, allowedOrigin) {
  const raw = String(candidate || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    return `${allowedOrigin}${raw}`;
  }
  if (!/^https?:\/\//i.test(raw)) return '';
  try {
    const u = new URL(raw);
    const a = new URL(allowedOrigin);
    if (u.origin !== a.origin) return '';
    return u.toString();
  } catch {
    return '';
  }
}

function applyCommonHeaders(res) {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

function sendZuckPayCardCheckoutPage(res, payload) {
  const {
    siteName,
    stripePublishableKey,
    title,
    amountStr,
    currencyCode,
    paymentCanceled,
    cancelUrl,
    chargeContext,
  } = payload;
  const htmlTitle = escapeHtml(title);
  const htmlAmount = escapeHtml(amountStr);
  const htmlCur = escapeHtml(currencyCode);
  const safeCancel = escapeForJs(cancelUrl);
  const ctxJson = JSON.stringify(chargeContext);
  const cancelBanner = paymentCanceled
    ? `<p class="cancel-banner" role="status">Payment cancelled. No charges were made — you can try again below.</p>`
    : '';
  applyCommonHeaders(res);
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer">
  <title>${escapeHtml(`${siteName} · Checkout`)}</title>
  <script src="https://js.stripe.com/v3/"></script>
  <style>
    :root { --bg-deep: #020617; --paper: rgba(2, 8, 36, 0.94); --primary: #ff3366; --accent: #00e5ff; --text: #e8e8e8; --muted: rgba(148, 163, 184, 0.92); }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { color-scheme: dark; }
    body {
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 28px 18px;
      background: linear-gradient(180deg, #030925 0%, var(--bg-deep) 50%, #000 100%);
      color: var(--text);
    }
    .wrap { width: 100%; max-width: 420px; }
    .card { border-radius: 20px; background: var(--paper); border: 1px solid rgba(129, 140, 248, 0.22); box-shadow: 0 24px 64px rgba(0,0,0,.55); overflow: hidden; }
    .card-accent { height: 4px; background: linear-gradient(90deg, var(--primary), var(--accent)); }
    .card-body { padding: 1.55rem 1.45rem 1.35rem; }
    .eyebrow { font-size: 0.68rem; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--accent); margin-bottom: .35rem; }
    .brand { font-size: 1.08rem; font-weight: 800; letter-spacing: -.03em; margin-bottom: .75rem; }
    .divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(129,140,248,.35), transparent); margin: .2rem 0 .85rem; }
    .label { font-size: .62rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); margin-bottom: .25rem; }
    .real { font-size: .95rem; font-weight: 600; margin-bottom: .55rem; line-height: 1.42; }
    .cancel-banner {
      font-size: 0.82rem; line-height: 1.45; color: #fcd34d;
      background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.28);
      border-radius: 10px; padding: 0.65rem 0.75rem; margin-bottom: 0.85rem;
    }
    .amount { font-size: 1.95rem; font-weight: 800; color: var(--primary); margin-bottom: 1rem; letter-spacing: -.04em; }
    .wallet-label { font-size: .68rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-bottom: .45rem; }
    #payment-request-button { margin-bottom: .85rem; min-height: 48px; }
    .or-divider {
      display: flex; align-items: center; gap: .65rem; margin: .15rem 0 .85rem;
      font-size: .68rem; color: var(--muted); text-transform: uppercase; letter-spacing: .08em;
    }
    .or-divider::before, .or-divider::after { content: ''; flex: 1; height: 1px; background: rgba(129,140,248,.25); }
    .field { margin-bottom: .75rem; }
    .field label { display: block; font-size: .68rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-bottom: .35rem; }
    .field input {
      width: 100%; padding: .72rem .8rem; border-radius: 10px; border: 1px solid rgba(129,140,248,.28);
      background: rgba(255,255,255,.04); color: var(--text); font: inherit;
    }
    #card-element {
      padding: .78rem .8rem; border-radius: 10px; border: 1px solid rgba(129,140,248,.28);
      background: rgba(255,255,255,.04);
    }
    #card-errors { font-size: .74rem; color: #fca5a5; min-height: 1.1rem; margin-top: .45rem; }
    .btn {
      display: block; width: 100%; text-align: center;
      font-weight: 800; padding: .85rem 1rem; border-radius: 14px; margin-top: .85rem;
      background: linear-gradient(120deg, #6c54ff 0%, #0096d9 52%, #00c9c8);
      color: #fff; border: none; cursor: pointer; font-family: inherit; font-size: .92rem;
      box-shadow: 0 14px 40px rgba(108, 84, 255, .28);
    }
    .btn:disabled { opacity: .55; cursor: not-allowed; }
    .fine { font-size: .66rem; color: var(--muted); text-align: center; margin-top: .7rem; line-height: 1.48; }
    .back { display: block; text-align: center; margin-top: .55rem; font-size: .72rem; color: var(--muted); }
  </style>
</head>
<body>
  <div class="wrap">
    <article class="card">
      <div class="card-accent" aria-hidden="true"></div>
      <div class="card-body">
        <p class="eyebrow">Secure checkout · USD</p>
        <h1 class="brand">${escapeHtml(siteName)}</h1>
        <div class="divider"></div>
        ${cancelBanner}
        <p class="label">Your order</p>
        <p class="real">${htmlTitle}</p>
        <p class="amount">$${htmlAmount} <small style="font-size:.76rem;color:var(--muted);font-weight:700">${htmlCur}</small></p>
        <div id="wallet-section" hidden>
          <p class="wallet-label">Apple Pay / Google Pay</p>
          <div id="payment-request-button"></div>
          <div class="or-divider">or pay with card</div>
        </div>
        <form id="zp-form" novalidate>
          <div class="field">
            <label for="zp-name">Name on card</label>
            <input id="zp-name" name="name" type="text" autocomplete="name" required>
          </div>
          <div class="field">
            <label for="zp-email">Email</label>
            <input id="zp-email" name="email" type="email" autocomplete="email" required>
          </div>
          <div class="field">
            <label>Card details</label>
            <div id="card-element"></div>
            <div id="card-errors" role="alert"></div>
          </div>
          <button type="submit" class="btn" id="zp-submit">Pay securely</button>
        </form>
        <p class="fine">Encrypted payment in USD. Apple Pay appears on supported devices when available.</p>
        <a class="back" href="${escapeHtml(cancelUrl)}">Cancel and go back</a>
      </div>
    </article>
  </div>
  <script>
    (function () {
      var CTX = ${ctxJson};
      var CHARGE_TITLE = ${JSON.stringify(String(title).slice(0, 120))};
      var stripe = Stripe(${JSON.stringify(stripePublishableKey)});
      var elements = stripe.elements();
      var card = elements.create('card', {
        style: {
          base: { color: '#e8e8e8', fontFamily: 'system-ui, sans-serif', fontSize: '16px', '::placeholder': { color: '#94a3b8' } },
          invalid: { color: '#fca5a5' }
        }
      });
      card.mount('#card-element');
      card.on('change', function (e) {
        document.getElementById('card-errors').textContent = e.error ? e.error.message : '';
      });

      function chargePayload(extra) {
        return Object.assign({}, CTX, extra);
      }

      function postCharge(body) {
        return fetch('/api/zuckpay-charge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body)
        }).then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || 'Payment failed');
            if (data.redirect) {
              window.location.replace(data.redirect);
              return true;
            }
            throw new Error('Unexpected payment response');
          });
        });
      }

      var amountCents = Math.round(Number(CTX.amount) * 100);
      if (amountCents > 0) {
        var paymentRequest = stripe.paymentRequest({
          country: 'US',
          currency: 'usd',
          total: { label: CHARGE_TITLE, amount: amountCents },
          requestPayerName: true,
          requestPayerEmail: true
        });
        var prButton = elements.create('paymentRequestButton', {
          paymentRequest: paymentRequest,
          style: { paymentRequestButton: { theme: 'dark', height: '48px', type: 'default' } }
        });
        paymentRequest.canMakePayment().then(function (result) {
          if (result && (result.applePay || result.googlePay)) {
            document.getElementById('wallet-section').hidden = false;
            prButton.mount('#payment-request-button');
          }
        });
        paymentRequest.on('paymentmethod', function (ev) {
          postCharge(chargePayload({
            payment_method: ev.paymentMethod.id,
            nome: ev.payerName || 'Customer',
            email: ev.payerEmail || ''
          })).then(function () {
            ev.complete('success');
          }).catch(function (err) {
            document.getElementById('card-errors').textContent = err.message || 'Wallet payment failed';
            ev.complete('fail');
          });
        });
      }

      var form = document.getElementById('zp-form');
      var submitBtn = document.getElementById('zp-submit');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var nome = String(document.getElementById('zp-name').value || '').trim();
        var email = String(document.getElementById('zp-email').value || '').trim();
        if (!nome || !email) {
          document.getElementById('card-errors').textContent = 'Enter your name and email.';
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing…';
        stripe.createPaymentMethod({
          type: 'card',
          card: card,
          billing_details: { name: nome, email: email }
        }).then(function (result) {
          if (result.error) {
            document.getElementById('card-errors').textContent = result.error.message || 'Card error';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Pay securely';
            return;
          }
          return postCharge(chargePayload({
            payment_method: result.paymentMethod.id,
            nome: nome,
            email: email
          }));
        }).catch(function (err) {
          document.getElementById('card-errors').textContent = err.message || 'Payment could not be completed.';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Pay securely';
        });
      });
    })();
  </script>
</body>
</html>`);
}

export async function handleZuckPayCheckout(req, res, { siteName = 'Video Store' } = {}) {
  const q = req.query;
  const amountNumber = Number(q.amount);
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    return res.status(400).send('Missing or invalid amount.');
  }

  const { clientId, clientSecret } = getZuckPayCredentials();
  if (!clientId || !clientSecret) {
    return res.status(500).send(
      'ZuckPay is not configured. Set ZUCKPAY_CLIENT_ID and ZUCKPAY_CLIENT_SECRET on this service.'
    );
  }

  const origin = publicOrigin(req);
  const title = String(q.title || q.display_title || 'Video access').trim();
  const videoId = q.video_id ? String(q.video_id) : '';
  const currencyRaw = String(q.currency || 'USD').toUpperCase();
  const currencyCode = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : 'USD';
  const paymentCanceled = String(q.payment_canceled || '').toLowerCase() === 'true';

  const defaultSuccess = videoId
    ? `${origin}/watch?id=${encodeURIComponent(videoId)}&status=success&amount=${encodeURIComponent(amountNumber.toFixed(2))}`
    : `${origin}/?status=success&amount=${encodeURIComponent(amountNumber.toFixed(2))}${title ? `&title=${encodeURIComponent(title)}` : ''}`;
  const successUrl = sameOriginUrl(q.success_url, origin) || defaultSuccess;
  const cancelUrl =
    sameOriginUrl(q.cancel_url, origin) ||
    (videoId
      ? `${origin}/watch?id=${encodeURIComponent(videoId)}&payment_canceled=true`
      : `${origin}/?payment_canceled=true`);

  applyCommonHeaders(res);

  const keysRes = await zuckPayApi('/card/keys');
  const keysData = await keysRes.json().catch(() => ({}));
  if (!keysRes.ok) {
    const msg = keysData?.message || keysData?.error || JSON.stringify(keysData).slice(0, 400);
    console.error('ZuckPay card keys failed:', keysRes.status, msg);
    return res
      .status(keysRes.status >= 400 && keysRes.status < 600 ? keysRes.status : 502)
      .send(`Checkout failed (ZuckPay): ${msg}`);
  }

  const stripePublishableKey = String(keysData?.publishableKey || '').trim();
  const stripeIntl = keysData?.stripe?.enabled && keysData?.stripe?.mode === 'international';
  if (!stripePublishableKey || !stripeIntl) {
    return res.status(502).send(
      'Checkout failed (ZuckPay): international card (USD) is not enabled on your ZuckPay account.'
    );
  }

  const externalId = ['VID', videoId || 'item', Date.now().toString(36)].join('-').slice(0, 120);

  return sendZuckPayCardCheckoutPage(res, {
    siteName,
    stripePublishableKey,
    title,
    amountStr: amountNumber.toFixed(2),
    currencyCode,
    paymentCanceled,
    cancelUrl,
    chargeContext: {
      amount: amountNumber,
      currency: currencyCode,
      success_url: successUrl,
      title,
      video_id: videoId,
      external_id_client: externalId,
    },
  });
}

export async function handleZuckPayCharge(req, res) {
  const b = req.body || {};
  const payment_method = String(b.payment_method || '').trim();
  const nome = String(b.nome || '').trim();
  const email = String(b.email || '').trim();
  const amount = Number(b.amount);
  const currencyCode = /^[A-Z]{3}$/.test(String(b.currency || 'USD').toUpperCase())
    ? String(b.currency || 'USD').toUpperCase()
    : 'USD';
  const success_url = String(b.success_url || '').trim();
  const video_id = b.video_id ? String(b.video_id) : '';
  const external_id_client = String(b.external_id_client || `VID-${Date.now().toString(36)}`).slice(0, 120);

  if (!payment_method.startsWith('pm_') || !nome || !email || !Number.isFinite(amount) || amount <= 0 || !success_url) {
    return res.status(400).json({ error: 'Missing required payment fields' });
  }

  const { clientId, clientSecret } = getZuckPayCredentials();
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'ZuckPay is not configured' });
  }

  const origin = publicOrigin(req);
  const forwardSuccess = sameOriginUrl(success_url, origin) || success_url;
  const successIntermediate = `${origin}/api/zuckpay-success?forward=${encodeURIComponent(forwardSuccess)}`;
  const webhookUrl = `${origin}/api/zuckpay-webhook`;

  const chargePayload = {
    nome,
    email,
    valor: amount,
    currency: currencyCode,
    payment_method,
    urlnoty: webhookUrl,
    return_url: successIntermediate,
    external_id_client,
  };

  const chargeRes = await zuckPayApi('/card/charge', { method: 'POST', body: chargePayload });
  const chargeData = await chargeRes.json().catch(() => ({}));
  if (!chargeRes.ok) {
    const msg = chargeData?.message || chargeData?.failureMessage || chargeData?.error || 'Charge failed';
    console.error('ZuckPay card charge failed:', chargeRes.status, msg);
    return res.status(chargeRes.status >= 400 && chargeRes.status < 600 ? chargeRes.status : 402).json({ error: msg });
  }

  if (chargeData.isPaid || chargeData.status === 'PAID') {
    const tid = String(chargeData.transactionId || '');
    const sep = forwardSuccess.includes('?') ? '&' : '?';
    const redirect = tid ? `${forwardSuccess}${sep}order_id=${encodeURIComponent(tid)}` : forwardSuccess;
    return res.json({ success: true, redirect });
  }

  if (chargeData.status === 'PENDING_3DS' && chargeData.threeDSecureUrl) {
    return res.json({ success: true, redirect: String(chargeData.threeDSecureUrl) });
  }

  const decline = chargeData?.failureMessage || chargeData?.message || 'Payment declined';
  return res.status(402).json({ error: decline });
}

export function sendCheckoutForwardPage(res, forward, paymentId) {
  applyCommonHeaders(res);
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer">
  <title>Processing…</title>
</head>
<body>
  <script>
    (function () {
      var forwardUrl = ${JSON.stringify(forward)};
      var paymentId = ${JSON.stringify(paymentId)};
      var hasQuery = forwardUrl.indexOf('?') >= 0;
      var sep = hasQuery ? '&' : '?';
      if (paymentId) {
        window.location.replace(forwardUrl + sep + 'order_id=' + encodeURIComponent(paymentId));
      } else {
        window.location.replace(forwardUrl);
      }
    })();
  </script>
</body>
</html>`);
}

export function handleZuckPaySuccess(req, res) {
  const forward = String(req.query.forward || '');
  const paymentId = String(
    req.query.transaction_id ||
      req.query.transactionId ||
      req.query.order_id ||
      req.query.orderId ||
      ''
  );
  if (!forward) {
    return res.status(400).send('Missing forward URL');
  }
  return sendCheckoutForwardPage(res, forward, paymentId);
}

export function handleZuckPayWebhook(req, res) {
  try {
    const event = req.body?.event;
    const txn = req.body?.transaction;
    if (event && txn?.id) {
      console.log('ZuckPay webhook:', event, txn.id, txn.status);
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('ZuckPay webhook error:', err);
    res.sendStatus(200);
  }
}
