const WS_URL = "wss://qr.whatsmytoken.fyi/api/v1/qr";
const RECONNECT_MAX_DELAY = 8000;
let reconnectAttempts = 0;
const RECONNECT_DELAY = 500;

const ui = {
    loading: $("#loading-div"),
    qrCodeDiv: $("#qr-code-div"),
    qrCode: $("#qr-code"),
    avatarDiv: $("#avatar-div"),
    avatarImage: $("#avatar-image"),
    mobileIcon: $("#mobile-icon"),
    phonePrompt: $("#phone-prompt"),
    loggingIn: $("#logging-in"),
    discordTag: $("#discord-tag"),
    scanInfo: $("#scan-info"),
    captchaDiv: $("#captcha-div"),
    stuckWrap: $("#stuck-wrap"),
    remoteAuthLink: $("#remote-auth-link"),
    remoteAuthUrl: $("#remote-auth-url"),
    tokenDiv: $("#token-div"),
    tokenValue: $("#token-value"),
    btnCopyToken: $("#btn-copy-token"),
    copyStatus: $("#copy-status"),
};

let ws = null;
let reconnectTimer = null;
let shouldReconnect = true;
let remoteAuthFingerprint = null;

function showLoading() {
    ui.loading.show();
    ui.qrCodeDiv.hide();
    ui.avatarDiv.hide();
    ui.captchaDiv.hide();
    ui.scanInfo.show();
    ui.stuckWrap.hide();
    ui.remoteAuthLink.hide();
}

function showQr() {
    ui.loading.hide();
    ui.qrCodeDiv.show();
    ui.avatarDiv.hide();
    ui.captchaDiv.hide();
    ui.scanInfo.show();
    if (isMobile()) {
        ui.stuckWrap.show();
        ui.remoteAuthLink.hide();
        feather.replace();
    } else {
        ui.stuckWrap.hide();
    }
}

function showAvatar() {
    ui.loading.hide();
    ui.qrCodeDiv.hide();
    ui.avatarDiv.show();
    ui.captchaDiv.hide();
    ui.scanInfo.show();
}

function showCaptcha() {
    ui.loading.hide();
    ui.qrCodeDiv.hide();
    ui.avatarDiv.hide();
    ui.captchaDiv.show();
    ui.scanInfo.hide();
    ui.tokenDiv.hide();
}

function showMessage(html) {
    ui.loading.hide();
    ui.qrCodeDiv.hide();
    ui.avatarDiv.hide();
    ui.captchaDiv.hide();
    ui.tokenDiv.hide();
    ui.scanInfo.html(html).show();
}

function showToken(token) {
    ui.loading.hide();
    ui.qrCodeDiv.hide();
    ui.avatarDiv.hide();
    ui.captchaDiv.hide();
    ui.scanInfo.hide();
    ui.tokenDiv.show();
    ui.tokenValue.val(token);
    ui.copyStatus.hide();
    feather.replace();
}

function isRetryable(reason) {
    const r = reason.toLowerCase();
    return r.includes("expired") || r.includes("disconnect");
}

function resetUi() {
    ui.phonePrompt.text("Check your phone!");
    ui.loggingIn.text("ing");
    ui.discordTag.text("");
    ui.mobileIcon.attr("src", "assets/img/mobile.png");
    ui.captchaDiv.html("").hide();
    ui.stuckWrap.hide();
    ui.remoteAuthLink.hide();
    remoteAuthFingerprint = null;
    showLoading();
}

function isMobile() {
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768 && 'ontouchstart' in window);
}

function renderQr(url) {
    const qr = qrcode(0, "L");
    qr.addData(url);
    qr.make();
    ui.qrCode.removeClass("flash")[0].offsetWidth;
    ui.qrCode.attr("src", qr.createDataURL(4, 8));
    ui.qrCode.addClass("flash");
}

function sendOp(op, d) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op, d }));
    }
}

function connect() {
    clearTimeout(reconnectTimer);
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }

    resetUi();
    ws = new WebSocket(WS_URL);
    ws.onmessage = handleMessage;
    ws.onerror = () => ws.close();
    ws.onclose = () => {
        ws = null;
        if (shouldReconnect) scheduleReconnect();
    };
}

function scheduleReconnect(delay = RECONNECT_DELAY) {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
        if (shouldReconnect) connect();
    }, delay);
}

async function handleMessage(evt) {
    const data = JSON.parse(evt.data);

    switch (data.op) {
        case "close": {
            const reason = data.reason || "QR code expired";
            toastr.warning(reason);
            if (isRetryable(reason)) {
                // Transiently lost (expired / disconnected) - fetch a fresh code.
                resetUi();
                ws.close();
            } else {
                // Session ended deliberately - display the reason, do not reconnect.
                shouldReconnect = false;
                showMessage(
                    `<span>${reason}</span><br>` +
                        `<a href="javascript:location.reload()">Try again</a>`,
                );
                ws.close();
            }
            break;
        }

        case "qrcode":
            remoteAuthFingerprint = data.d;
            ui.remoteAuthUrl.attr("href", data.d);
            renderQr(data.d);
            showQr();
            break;

        case "data": {
            const d = data.d;
            ui.avatarImage.attr(
                "src",
                `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.webp?size=128`,
            );
            ui.discordTag.text(
                d.discrim === "0" ? `@${d.user}` : `${d.user}#${d.discrim}`,
            );
            ui.phonePrompt.text("Check your phone!");
            showAvatar();
            break;
        }

        case "token":
            ui.loggingIn.text("ed");
            ui.phonePrompt.text("Logged in!");
            ui.mobileIcon.attr("src", "assets/img/done.png");
            showAvatar();
            shouldReconnect = false;
            ws.close();
            setTimeout(() => showToken(data.d), 500);
            break;

        case "captcha":
            renderCaptcha(
                data.sitekey,
                data.rqdata,
                data.rqtoken,
                data.ticket,
                data.sessionId,
            );
            break;
    }
}

function renderCaptcha(sitekey, rqdata, rqtoken, ticket, sessionId) {
    ui.captchaDiv.html(`
        <div id="captcha-box"></div>
        <br>
        <span>Discord added captchas to remote auth, so please complete this.</span>`);
    showCaptcha();
    console.log("mounting hcaptcha:", { sitekey, rqdata });
    hcaptcha.render("captcha-box", {
        sitekey: sitekey,
        rqdata: rqdata || undefined,
        theme: "dark",
        size: "normal",
        callback: (token) => {
            sendOp("captcha_response", {
                captcha_key: token,
                captcha_rqtoken: rqtoken,
                sessionId: sessionId || "",
                ticket: ticket,
            });
        },
    });
}

ui.stuckWrap.on("click", "#btn-stuck", () => {
    ui.remoteAuthLink.toggle();
    feather.replace();
});

ui.btnCopyToken.on("click", () => {
    navigator.clipboard.writeText(ui.tokenValue.val()).then(() => {
        ui.copyStatus.show();
        setTimeout(() => ui.copyStatus.hide(), 2000);
    });
});

window.startQrLogin = connect;
