"""Actual Chromium UI journey against loopback HTTP and real application handlers.

Uses synthetic identities and in-memory repositories, NOT OIDC, PostgreSQL,
Android/iOS or hosted Staging acceptance. No production URL is accepted.
"""
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from playwright.sync_api import expect, sync_playwright

origin = sys.argv[1]
if not re.fullmatch(r"http://127\.0\.0\.1:\d+", origin):
    raise ValueError("The browser fixture must be literal loopback HTTP.")
output = Path("dist/browser")
checks = []
report = {
    "schemaVersion": 1,
    "passed": False,
    "sourceRevision": os.environ.get("GITHUB_SHA", "local-worktree"),
    "environment": "loopback-chromium-memory-synthetic-auth",
    "physicalDevice": False,
    "hostedStaging": False,
    "checks": checks,
}


def passed(name):
    checks.append({"name": name, "passed": True})
    print("PASS " + name, flush=True)


def settle(page):
    page.wait_for_function("!document.querySelector('form[aria-busy=\"true\"]')")


def save(page, form):
    form.locator('button[type="submit"]').click()
    settle(page)


def section(page, name):
    page.locator(f'[data-page="{name}"]').click()
    expect(page.locator("#rep-content")).not_to_have_attribute("aria-busy", "true")


def live_section(page, name):
    page.locator(f'[data-live-section="{name}"]').click()
    expect(page.locator("#live-content")).not_to_have_attribute("aria-busy", "true")


def read(page, path, actor):
    response = page.request.get(origin + path, headers={"Authorization": "Bearer " + actor})
    assert response.status == 200, f"{path}: {response.status}"
    return response.json()


try:
    with sync_playwright() as playwright:
        executable = os.environ.get("CHROMIUM_PATH")
        browser = playwright.chromium.launch(**({"executable_path": executable} if executable else {}))
        report["browserVersion"] = browser.version
        context = browser.new_context(viewport={"width": 390, "height": 844}, locale="ar-SA", timezone_id="Europe/Stockholm")
        context.tracing.start(screenshots=True, snapshots=True, sources=True)
        errors = []
        rep = context.new_page()
        rep.on("pageerror", lambda error: errors.append(str(error)))
        rep.goto(origin + "/?role=rep")
        expect(rep.locator("body")).to_have_attribute("data-ready", "true")
        expect(rep.locator("html")).to_have_attribute("dir", "rtl")
        passed("representative authenticated workspace renders in mobile-width RTL Chromium")

        # Real browser offline state; no response stubbing or fabricated server success.
        section(rep, "tasks")
        rep.get_by_role("button", name="إضافة", exact=True).click()
        form = rep.locator("form")
        form.locator('[name="title"]').fill("Field offline follow-up")
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
        form.locator('[name="dueOn"]').fill(tomorrow)
        context.set_offline(True)
        save(rep, form)
        expect(form.locator(".form-status")).to_contain_text("الاتصال")
        expect(form.locator('[name="title"]')).to_have_value("Field offline follow-up")
        context.set_offline(False)
        assert read(rep, "/v1/sales/tasks", "rep")["items"] == []
        save(rep, form)
        expect(rep.locator("#rep-content")).to_contain_text("Field offline follow-up")
        assert len(read(rep, "/v1/sales/tasks", "rep")["items"]) == 1
        passed("network loss preserves form input and reconnection requires explicit nonduplicating retry")

        section(rep, "visits")
        rep.get_by_role("button", name="جدولة زيارة", exact=True).click()
        form = rep.locator("form")
        form.locator('[name="scheduledAt"]').fill(datetime.now(ZoneInfo("Europe/Stockholm")).strftime("%Y-%m-%dT12:00"))
        form.locator('[name="purpose"]').fill("Browser field scope discovery")
        save(rep, form)
        rep.get_by_role("button", name="تسجيل الوصول", exact=True).click()
        form = rep.locator("form")
        expect(form.locator('[name="kind"]')).to_have_value("manual")
        form.locator('[name="reason"]').fill("Customer reception confirmed arrival")
        save(rep, form)
        expect(rep.get_by_role("button", name="إنهاء الزيارة", exact=True)).to_be_visible()
        visit = read(rep, "/v1/sales/visits", "rep")["items"][0]
        assert visit["startProof"]["kind"] == "manual"
        assert read(rep, "/v1/tracking/sessions/current", "rep")["items"] == []
        passed("visit scheduling and explicit manual arrival persist without collecting location")

        section(rep, "quotes")
        rep.get_by_role("button", name="إعداد عرض", exact=True).click()
        form = rep.locator("form")
        form.locator('[name="validUntil"]').fill(tomorrow)
        form.locator('[name="terms"]').fill("Synthetic browser field proposal, no commercial agreement")
        rep.get_by_role("button", name="تعبئة الدفعة الأولى بكامل الإجمالي", exact=True).click()
        save(rep, form)
        rep.get_by_role("button", name="إرسال للعميل", exact=True).click()
        save(rep, rep.locator("form"))
        expect(rep.locator("#rep-content")).to_contain_text("مرسل")
        quote = read(rep, "/v1/sales/quotes", "rep")["items"][0]
        assert quote["totalMinor"] == 10000 and quote["status"] == "sent"
        passed("catalog-backed quote creation and explicit sending use authoritative service pricing")

        client = context.new_page()
        client.on("pageerror", lambda error: errors.append(str(error)))
        client.goto(origin + "/?role=client")
        expect(client.locator("body")).to_have_attribute("data-ready", "true")
        live_section(client, "quotes")
        client.locator('[data-live-review="quote"]').click()
        form = client.locator('[data-live-form="quote-accept"]')
        expect(form.locator('[name="consent"]')).not_to_be_checked()
        form.locator('[name="consent"]').check()
        save(client, form)
        expect(client.locator("#live-content")).to_contain_text("مقبول")
        live_section(client, "contracts")
        client.locator('[data-live-review="contract"]').click()
        form = client.locator('[data-live-form="contract-approve"]')
        form.locator('[name="signerName"]').fill("Synthetic Customer Signer")
        form.locator('[name="consent"]').check()
        save(client, form)
        expect(client.locator("#live-content")).to_contain_text("تمت الموافقة")
        client.screenshot(path=str(output / "client-approved.png"), full_page=True)
        passed("Client UI separately accepts the quote and explicitly approves the contract")

        rep.bring_to_front()
        section(rep, "quotes")
        expect(rep.locator("#rep-content")).to_contain_text("مقبول")
        section(rep, "visits")
        rep.get_by_role("button", name="إنهاء الزيارة", exact=True).click()
        form = rep.locator("form")
        form.locator('[name="outcome"]').select_option("agreement")
        form.locator('[name="notes"]').fill("Field completion synchronized across applications")
        form.locator('[name="nextStep"]').fill("Approved delivery handover")
        save(rep, form)
        expect(rep.locator("#rep-content")).to_contain_text("مكتملة")
        admin = context.new_page()
        admin.on("pageerror", lambda error: errors.append(str(error)))
        admin.goto(origin + "/?role=admin")
        expect(admin.locator("body")).to_have_attribute("data-ready", "true")
        live_section(admin, "visits")
        expect(admin.locator("#live-content")).to_contain_text("مكتمل")
        persisted = read(admin, "/v1/sales/visits/" + visit["id"], "admin")
        assert persisted["notes"] == "Field completion synchronized across applications"
        admin.screenshot(path=str(output / "admin-visit.png"), full_page=True)
        passed("Representative visit completion appears in Admin UI and persisted authorized Admin data")

        rep.bring_to_front()
        section(rep, "messages")
        rep.get_by_role("button", name="بدء محادثة", exact=True).click()
        save(rep, rep.locator("form"))
        rep.get_by_role("button", name="فتح المحادثة", exact=True).click()
        form = rep.locator("form")
        form.locator('[name="body"]').fill("Field handover message for the customer")
        save(rep, form)
        expect(rep.locator(".message-list")).to_contain_text("Field handover message")
        rep.get_by_role("button", name="تعليم الرسائل المعروضة كمقروءة", exact=True).click()
        expect(rep.locator("#rep-content")).to_contain_text("آخر تأكيد لقراءتك")
        expect(rep.locator("#rep-content")).to_contain_text("لا تتوفر هنا حالة قراءة الطرف الآخر")
        conversation = read(rep, "/v1/communications/conversations", "rep")["items"][0]
        client_messages = read(client, "/v1/communications/conversations/" + conversation["id"] + "/messages", "client")
        assert client_messages["items"][0]["body"] == "Field handover message for the customer"
        assert client_messages["receipt"] is None
        passed("messages reach Client data and read acknowledgements remain actor-specific")

        section(rep, "support")
        rep.get_by_role("button", name="طلب دعم", exact=True).click()
        form = rep.locator("form")
        form.locator('[name="subject"]').fill("Field connectivity support")
        form.locator('[name="message"]').fill("Synthetic support request from the field")
        save(rep, form)
        live_section(admin, "tickets")
        expect(admin.locator("#live-content")).to_contain_text("Field connectivity support")
        section(rep, "account")
        form = rep.locator("form")
        form.locator('[name="displayName"]').fill("Field Representative")
        save(rep, form)
        expect(rep.locator("#rep-content article")).to_contain_text("Field Representative")
        passed("support is visible to Admin and profile changes are persisted by Identity")

        section(rep, "schedule")
        expect(rep.locator("#rep-content")).to_contain_text("Browser field scope discovery")
        assert rep.evaluate("document.documentElement.scrollWidth <= innerWidth + 2")
        rep.screenshot(path=str(output / "rep-schedule.png"), full_page=True)
        section(rep, "routes")
        expect(rep.locator("#rep-content")).to_contain_text("ليست تحسينًا آليًا للمسار")
        passed("daily schedule is mobile-width RTL and visit lists do not claim route optimization")
        assert not errors, errors
        passed("all three browser surfaces complete the journey without uncaught JavaScript errors")
        report["passed"] = True
        context.tracing.stop(path=str(output / "field-trace.zip"))
        browser.close()
except Exception as error:
    report["error"] = str(error)
    raise
finally:
    output.mkdir(parents=True, exist_ok=True)
    (output / "field-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
