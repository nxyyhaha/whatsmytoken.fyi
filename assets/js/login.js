$(function () {
    const $choice = $("#login-choice");
    const $directDiv = $("#direct-login-div");
    const $mfaDiv = $("#mfa-div");
    const $dlEmail = $("#dl-email");
    const $dlPassword = $("#dl-password");
    const $dlCaptcha = $("#dl-captcha");
    const $dlError = $("#dl-error");
    const $mfaLabel = $("#mfa-label");
    const $mfaCode = $("#mfa-code");
    const $mfaError = $("#mfa-error");
    const $mfaCodeWrap = $("#mfa-code-wrap");
    const $mfaBackupWrap = $("#mfa-backup-wrap");
    const $mfaCaptcha = $("#mfa-captcha");
    const $btnLogin = $("#btn-login");
    const $btnMfa = $("#btn-mfa");
    const $btnMfaBackup = $("#btn-mfa-backup");
    const $btnClient = $("#btn-client");
    const $btnAgree = $("#btn-agree");
    const $countdown = $("#agree-countdown");
    const $warningModal = $("#warning-modal");
    const $tokenDiv = $("#token-div");
    const $tokenValue = $("#token-value");
    const $btnCopyToken = $("#btn-copy-token");
    const $copyStatus = $("#copy-status");

    let agreeTimer = null;
    let agreed = false;
    let mfa = null;
    let mfaCaptchaKey = null;
    let mfaCaptchaRqtoken = null;
    // Same-origin by default (works on localhost:8787 and in prod).
    // Override for testing: ?api=http://localhost:8787 or localStorage.api_base.
    function resolveApiBase() {
        try {
            const params = new URLSearchParams(location.search);
            let override = params.get("api") || localStorage.getItem("api_base");
            if (override && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(override)) {
                override = "http://" + override; // tolerate ?api=localhost:8787
            }
            if (override) return new URL(override, location.href).origin;
        } catch (e) {}
        // file:// has origin "null" — default to local backend.
        if (!location.host) return "http://localhost:8787";
        if (location.host === "whatsmytoken.fyi" || location.host === "www.whatsmytoken.fyi") {
            return "https://qr.whatsmytoken.fyi";
        }
        return location.origin;
    }
    const API_BASE = resolveApiBase();
    const api = (p) => `${API_BASE}${p}`;
    axios.defaults.withCredentials = true;
    let verifyUrl = api("/api/v1/auth/mfa/totp");

    function showChoice() {
        $("#loading-div").hide();
        $("#qr-code-div").hide();
        $("#avatar-div").hide();
        $("#captcha-div").hide();
        $("#scan-info").hide();
        $directDiv.hide();
        $mfaDiv.hide();
        $tokenDiv.hide();
        $dlCaptcha.html("");
        $choice.show();
    }

    function showError($el, msg) {
        $el.text(msg).show();
    }

    function toast(msg, type) {
        if (type === "warning") {
            toastr.warning(msg);
        } else {
            toastr.info(msg);
        }
    }

    function showToken(token) {
        $choice.hide();
        $directDiv.hide();
        $mfaDiv.hide();
        $tokenDiv.show();
        $tokenValue.val(token);
        $copyStatus.hide();
        feather.replace();
    }

    $btnCopyToken.on("click", () => {
        navigator.clipboard.writeText($tokenValue.val()).then(() => {
            $copyStatus.show();
            setTimeout(() => $copyStatus.hide(), 2000);
        });
    });

    $("#btn-qr").on("click", () => {
        $choice.hide();
        if (typeof window.startQrLogin === "function") window.startQrLogin();
        else toast("QR script not loaded. Reload and try again.", "warning");
    });

    $("#btn-client").on("click", () => {
        $choice.hide();
        $directDiv.hide();
        $mfaDiv.hide();
        $tokenDiv.hide();
        const bookmarklet = `javascript:(function(){var s=document.createElement('script');s.src='https://whatsmytoken.fyi/assets/js/client.js?v='+Date.now();document.body.appendChild(s);})();`;
        navigator.clipboard.writeText(bookmarklet).then(() => {
            $("#scan-info").html(
                `<p class="text-muted mb-3">Client-Side Token (Bookmarklet)</p>` +
                `<p class="text-muted small mb-3">Copied to clipboard. To use:</p>` +
                `<ol class="text-muted small text-start" style="list-style-position:inside;padding-left:0;">` +
                `<li>Create a new bookmark in your browser</li>` +
                `<li>Paste the code below as the bookmark URL</li>` +
                `<li>Go to discord.com and log in</li>` +
                `<li>Click the bookmark to grab the token from localStorage</li>` +
                `</ol>` +
                `<div style="background:#1a1d23;border:1px solid #2c2f33;border-radius:4px;padding:1rem;margin-bottom:1rem;word-break:break-all;white-space:pre-wrap;font-family:monospace;font-size:0.85rem;">${bookmarklet}</div>` +
                `<button type="button" class="btn btn-outline-secondary btn-sm" onclick="javascript:location.reload()">Back to choice</button>`
            ).show();
        }).catch(() => {
            $("#scan-info").html(
                `<p class="text-danger mb-2">Couldn't copy to clipboard. Copy manually below:</p>` +
                `<div style="background:#1a1d23;border:1px solid #2c2f33;border-radius:4px;padding:1rem;margin-bottom:1rem;word-break:break-all;white-space:pre-wrap;font-family:monospace;font-size:0.85rem;">${bookmarklet}</div>` +
                `<button type="button" class="btn btn-outline-secondary btn-sm" onclick="javascript:location.reload()">Back to choice</button>`
            ).show();
        });
    });

    $("#btn-direct").on("click", () => {
        if (typeof window.stopQrLogin === "function") window.stopQrLogin();
        $choice.hide();
        agreed = false;
        $btnAgree.prop("disabled", true);
        let secs = 5;
        $countdown.text(`${secs}s`);
        $warningModal.modal("show");
        clearInterval(agreeTimer);
        agreeTimer = setInterval(() => {
            secs -= 1;
            if (secs <= 0) {
                clearInterval(agreeTimer);
                $btnAgree.prop("disabled", false);
                $countdown.text("");
            } else {
                $countdown.text(`${secs}s`);
            }
        }, 1000);
    });

    $btnAgree.on("click", () => {
        clearInterval(agreeTimer);
        agreed = true;
        $warningModal.modal("hide");
        $directDiv.show();
        $dlEmail.trigger("focus");
    });

    $warningModal.on("hidden.bs.modal", () => {
        clearInterval(agreeTimer);
        if (!agreed) showChoice();
    });

    async function doLogin(captchaKey, captchaRqtoken) {
        const payload = {
            login: $dlEmail.val().trim(),
            password: $dlPassword.val(),
        };
        if (captchaKey) {
            payload.captcha_key = captchaKey;
            payload.captcha_rqtoken = captchaRqtoken;
        }
        const r = await axios.post(
            api("/api/v1/auth/login"),
            payload,
        );
        if (r.data.token) {
            showToken(r.data.token);
        } else if (r.data.mfa) {
            mfa = r.data;
            await showMfa();
        }
    }

    function mountCaptcha(sitekey, rqdata, rqtoken) {
        if (typeof hcaptcha === "undefined") {
            showError($dlError, "Captcha blocked. Disable your adblocker and try again.");
            return;
        }
        try { hcaptcha.reset(); } catch (e) {}
        $dlCaptcha.html(`
            <div id="dl-captcha-box"></div>
            <br>
            <span>Complete the captcha to continue.</span>`);
        console.log("mounting hcaptcha:", { sitekey, rqdata });
        hcaptcha.render("dl-captcha-box", {
            sitekey: sitekey,
            rqdata: rqdata || undefined,
            theme: "dark",
            size: "normal",
            callback: async (token) => {
                try {
                    await doLogin(token, rqtoken);
                } catch (err) {
                    handleLoginError(err);
                }
            },
        });
    }

    function handleLoginError(err) {
        const er = err.response;
        if (er && er.data && er.data.captcha_sitekey) {
            mountCaptcha(
                er.data.captcha_sitekey,
                er.data.captcha_rqdata,
                er.data.captcha_rqtoken,
            );
        } else if (er && er.status === 400) {
            const loginErrors =
                er.data &&
                er.data.errors &&
                er.data.errors.login &&
                er.data.errors.login._errors;
            if (
                loginErrors &&
                loginErrors.some(
                    (e) => e.code === "ACCOUNT_COMPROMISED_RESET_PASSWORD",
                )
            ) {
                showError(
                    $dlError,
                    "Your account has been compromised. Please reset your password on Discord, then try again.",
                );
            } else {
                showError($dlError, "Invalid email or password.");
            }
        } else {
            showError($dlError, "Something went wrong. Try again.");
        }
    }

    $btnLogin.on("click", async () => {
        $dlError.hide();
        $dlCaptcha.html("");
        if (!$dlEmail.val().trim() || !$dlPassword.val()) {
            showError($dlError, "Enter your email and password.");
            return;
        }
        $btnLogin.prop("disabled", true);
        try {
            await doLogin();
        } catch (err) {
            handleLoginError(err);
        } finally {
            $btnLogin.prop("disabled", false);
        }
    });

    async function showMfa() {
        $directDiv.hide();
        $mfaError.hide();
        $mfaCode.val("");
        $mfaBackupWrap.hide();
        mfaCaptchaKey = null;
        mfaCaptchaRqtoken = null;
        $mfaCaptcha.hide().html("");
        if (mfa.totp) {
            verifyUrl = api("/api/v1/auth/mfa/totp");
            $mfaLabel.text("Enter the code from your authenticator app.");
            $mfaCode.prop("placeholder", "6 digit code");
            $mfaCodeWrap.show();
            if (mfa.backup) $mfaBackupWrap.show();
        } else if (mfa.backup) {
            $mfaLabel.text("Authenticator app lost? Use a backup code.");
            $mfaCodeWrap.hide();
            $mfaBackupWrap.show();
        } else if (mfa.sms) {
            verifyUrl = api("/api/v1/auth/mfa/sms");
            $mfaLabel.text("Enter the code sent to your phone.");
            $mfaCode.prop("placeholder", "6 digit code");
            $mfaCodeWrap.show();
            try {
                await axios.post(
                    api("/api/v1/auth/mfa/sms/send"),
                    { ticket: mfa.ticket, login_instance_id: mfa.login_instance_id },
                );
            } catch (err) {
                $directDiv.show();
                showError(
                    $dlError,
                    "Couldn't send an SMS code. Try QR login instead.",
                );
                return;
            }
        } else {
            $directDiv.show();
            showError(
                $dlError,
                "2FA via Passkey isn't supported here. Try QR login instead.",
            );
            return;
        }
        $mfaDiv.show();
        $mfaCode.trigger("focus");
    }

    function mountMfaCaptcha(sitekey, rqdata, rqtoken) {
        if (typeof hcaptcha === "undefined") {
            showError($mfaError, "Discord asked for a captcha but it was blocked. Disable your adblocker and try again.");
            return;
        }
        try { hcaptcha.reset(); } catch (e) {}
        mfaCaptchaRqtoken = rqtoken || null;
        $mfaCaptcha.html(`<div id="mfa-captcha-box"></div>`).show();
        hcaptcha.render("mfa-captcha-box", {
            sitekey: sitekey,
            rqdata: rqdata || undefined,
            theme: "dark",
            size: "normal",
            callback: (token) => {
                mfaCaptchaKey = token;
                $mfaCaptcha.hide();
                $btnMfa.trigger("click"); // auto-retry with the solved captcha
            },
            "expired-callback": () => { mfaCaptchaKey = null; try { hcaptcha.reset(); } catch (e) {} },
            "error-callback": () => { mfaCaptchaKey = null; try { hcaptcha.reset(); } catch (e) {} },
        });
    }

    // Returns true if the error was a captcha challenge (handled), false otherwise.
    function handleMfaCaptcha(err) {
        const d = err && err.response && err.response.data;
        if (d && d.captcha_sitekey) {
            mountMfaCaptcha(d.captcha_sitekey, d.captcha_rqdata, d.captcha_rqtoken);
            return true;
        }
        return false;
    }

    function mfaVerifyPayload(code) {
        // login_instance_id is REQUIRED — Discord binds the MFA ticket to the
        // login instance (/auth/login returns it). Omitting it yields 60008
        // "Invalid two-factor code" even for a correct code.
        const payload = { ticket: mfa.ticket, code: code };
        if (mfa.login_instance_id) payload.login_instance_id = mfa.login_instance_id;
        if (mfaCaptchaKey) {
            payload.captcha_key = mfaCaptchaKey;
            if (mfaCaptchaRqtoken) payload.captcha_rqtoken = mfaCaptchaRqtoken;
        }
        return payload;
    }

    function mfaErrorMessage(err, fallback) {
        const d = err && err.response && err.response.data;
        if (d && d.message) {
            // 60008 = Discord genuinely rejected the code. The relay passes
            // {ticket, code} through untouched, so a correct-secret failure
            // here is almost always device clock drift (TOTP = 30s windows).
            if (d.code === 60008) {
                return "Invalid two-factor code. If your authenticator is right, check your device clock (enable automatic date & time) — codes depend on exact time.";
            }
            return d.message;
        }
        return fallback;
    }

    $btnMfa.on("click", async () => {
        const code = $mfaCode.val().trim();
        $mfaError.hide();
        if (!code) {
            showError($mfaError, "Enter your code.");
            return;
        }
        $btnMfa.prop("disabled", true);
        try {
            const r = await axios.post(verifyUrl, mfaVerifyPayload(code));
            showToken(r.data.token);
        } catch (err) {
            if (!handleMfaCaptcha(err)) {
                showError($mfaError, mfaErrorMessage(err, "Invalid code. Try again."));
            }
        } finally {
            $btnMfa.prop("disabled", false);
        }
    });

    $btnMfaBackup.on("click", async () => {
        const code = prompt(
            "THIS IS ONLY FOR IF YOU LOST MFA (aka this is for backup codes only).\nEnter a backup code:",
        );
        if (!code) return;
        $btnMfaBackup.prop("disabled", true);
        try {
            const r = await axios.post(
                api("/api/v1/auth/mfa/backup"),
                mfaVerifyPayload(code.trim()),
            );
            showToken(r.data.token);
        } catch (err) {
            if (!handleMfaCaptcha(err)) {
                showError($mfaError, mfaErrorMessage(err, "Invalid backup code. Try again."));
            }
        } finally {
            $btnMfaBackup.prop("disabled", false);
        }
    });

    showChoice();
});