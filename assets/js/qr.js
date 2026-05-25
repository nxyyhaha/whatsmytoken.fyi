// Client-side QR remote auth — connects to Worker instead of direct Discord
let ws = null;
let killReconnect = false;

function connect() {
    ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://qr.whatsmytoken.fyi/api/v1/qr_code`,
    );

    ws.onmessage = async (evt) => {
        const data = JSON.parse(evt.data);

        if (data.op === "close") {
            $("#phone-prompt").text(data.reason);
            ws.close();
        } else if (data.op === "qrcode") {
            const url = data.d;
            const qr = qrcode(0, "L");
            qr.addData(url);
            qr.make();
            const qrDataUrl = qr.createDataURL(4, 8);
            $("#qr-code").attr("src", qrDataUrl);
            $("#loading-div").hide();
            $("#avatar-div").hide();
            $("#qr-code-div").show();
            $("#scan-info").show();
        } else if (data.op === "data") {
            const d = data.d;
            $("#avatar-image").attr(
                "src",
                `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.webp?size=128`,
            );
            $("#discord-tag").text(
                d.discrim === "0" ? `@${d.user}` : `${d.user}#${d.discrim}`,
            );
            $("#phone-prompt").text("Check your phone!");
            $("#qr-code-div").hide();
            $("#avatar-div").show();
            $("#scan-info").show();
        } else if (data.op === "token") {
            $("#logging-in").text("ed");
            $("#phone-prompt").text("Logged in!");
            $("#mobile-icon").attr("src", "assets/img/done.png");
            $("#captcha-div").hide();
            $("#avatar-div").show();
            $("#scan-info").show();
            killReconnect = true;
            ws.close();
            setTimeout(() => prompt("Here is your token!", data.d), 500);
        } else if (data.op === "ticket") {
            try {
                const r = await axios.post(
                    "https://discord.com/api/v9/users/@me/remote-auth/login",
                    {
                        ticket: data.d,
                    },
                );
                ws.send(
                    JSON.stringify({ op: "token", d: r.data.encrypted_token }),
                );
            } catch (err) {
                const er = err.response;
                if (er && er.data && er.data.captcha_sitekey) {
                    const rqt = er.data.captcha_rqtoken;
                    $("#captcha-div").html(`
                        <h-captcha id="signupCaptcha" site-key="${er.data.captcha_sitekey}"
                            theme="dark" size="normal" rqdata="${er.data.captcha_rqdata}"
                            tabindex="0"></h-captcha><br>
                        <span>Discord added captchas to remote auth, so please complete this.</span>`);
                    $("#captcha-div").show();
                    $("#avatar-div").hide();
                    $("#scan-info").hide();
                    document
                        .getElementById("signupCaptcha")
                        .addEventListener("verified", async (e) => {
                            try {
                                const r2 = await axios.post(
                                    "https://discord.com/api/v9/users/@me/remote-auth/login",
                                    {
                                        ticket: data.d,
                                        captcha_key: e.token,
                                        captcha_rqtoken: rqt,
                                    },
                                );
                                ws.send(
                                    JSON.stringify({
                                        op: "token",
                                        d: r2.data.encrypted_token,
                                    }),
                                );
                            } catch (e2) {
                                console.error(e2);
                            }
                        });
                } else {
                    console.error(err);
                }
            }
        }
    };

    ws.onclose = () => {
        if (!killReconnect) setTimeout(connect, 500);
    };
}

connect();
