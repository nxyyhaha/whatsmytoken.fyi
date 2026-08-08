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
    const $btnLogin = $("#btn-login");
    const $btnMfa = $("#btn-mfa");
    const $btnMfaBackup = $("#btn-mfa-backup");
    const $btnAgree = $("#btn-agree");
    const $countdown = $("#agree-countdown");
    const $warningModal = $("#warning-modal");

    let agreeTimer = null;
    let agreed = false;
    let mfa = null;
    let verifyUrl = "https://qr.whatsmytoken.fyi/api/v1/auth/mfa/totp";

    function showChoice() {
        $("#loading-div").hide();
        $("#qr-code-div").hide();
        $("#avatar-div").hide();
        $("#captcha-div").hide();
        $("#scan-info").hide();
        $directDiv.hide();
        $mfaDiv.hide();
        $dlCaptcha.html("");
        $choice.show();
    }

    function showError($el, msg) {
        $el.text(msg).show();
    }

    function showToken(token) {
        toastr.success("Logged in!");
        setTimeout(() => prompt("Here is your token!", token), 500);
    }

    $("#btn-qr").on("click", () => {
        $choice.hide();
        window.startQrLogin();
    });

    $("#btn-direct").on("click", () => {
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
        const r = await axios.post("https://qr.whatsmytoken.fyi/api/v1/auth/login", payload);
        if (r.data.token) {
            showToken(r.data.token);
        } else if (r.data.mfa) {
            mfa = r.data;
            await showMfa();
        }
    }

    function mountCaptcha(sitekey, rqdata, rqtoken) {
        $dlCaptcha.html(`
            <div class="captcha-wrap">
                <h-captcha id="signupCaptcha" site-key="${sitekey}"
                    theme="dark" size="normal" rqdata="${rqdata}"
                    tabindex="0"></h-captcha>
            </div>
            <br>
            <span>Complete the captcha to continue.</span>`);
        document.getElementById("signupCaptcha").addEventListener("verified", async (e) => {
            try {
                await doLogin(e.token, rqtoken);
            } catch (err) {
                handleLoginError(err);
            }
        });
    }

    function handleLoginError(err) {
        const er = err.response;
        if (er && er.data && er.data.captcha_sitekey) {
            mountCaptcha(er.data.captcha_sitekey, er.data.captcha_rqdata, er.data.captcha_rqtoken);
        } else if (er && er.status === 400) {
            showError($dlError, "Invalid email or password.");
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
        if (mfa.totp) {
            verifyUrl = "https://qr.whatsmytoken.fyi/api/v1/auth/mfa/totp";
            $mfaLabel.text("Enter the code from your authenticator app.");
            $mfaCode.prop("placeholder", "6 digit code");
            $mfaCodeWrap.show();
            if (mfa.backup) $mfaBackupWrap.show();
        } else if (mfa.backup) {
            $mfaLabel.text("Authenticator app lost? Use a backup code.");
            $mfaCodeWrap.hide();
            $mfaBackupWrap.show();
        } else if (mfa.sms) {
            verifyUrl = "https://qr.whatsmytoken.fyi/api/v1/auth/mfa/sms";
            $mfaLabel.text("Enter the code sent to your phone.");
            $mfaCode.prop("placeholder", "6 digit code");
            $mfaCodeWrap.show();
            try {
                await axios.post("https://qr.whatsmytoken.fyi/api/v1/auth/mfa/sms/send", { ticket: mfa.ticket });
            } catch (err) {
                $directDiv.show();
                showError($dlError, "Couldn't send an SMS code. Try QR login instead.");
                return;
            }
        } else {
            $directDiv.show();
            showError($dlError, "2FA via Passkey isn't supported here. Try QR login instead.");
            return;
        }
        $mfaDiv.show();
        $mfaCode.trigger("focus");
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
            const r = await axios.post(verifyUrl, { ticket: mfa.ticket, code });
            showToken(r.data.token);
        } catch (err) {
            showError($mfaError, "Invalid code. Try again.");
        } finally {
            $btnMfa.prop("disabled", false);
        }
    });

    $btnMfaBackup.on("click", async () => {
        const code = prompt("THIS IS ONLY FOR IF YOU LOST MFA (aka this is for backup codes only).\nEnter a backup code:");
        if (!code) return;
        $btnMfaBackup.prop("disabled", true);
        try {
            const r = await axios.post("https://qr.whatsmytoken.fyi/api/v1/auth/mfa/backup", { ticket: mfa.ticket, code: code.trim() });
            showToken(r.data.token);
        } catch (err) {
            showError($mfaError, "Invalid backup code. Try again.");
        } finally {
            $btnMfaBackup.prop("disabled", false);
        }
    });

    showChoice();
});
