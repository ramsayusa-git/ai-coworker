"""Login / logout."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Form, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse

from app.security.auth import SessionManager, get_session_manager

router = APIRouter(tags=["auth"])


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request, manager: SessionManager = Depends(get_session_manager)):
    if manager.read_session(request.cookies.get(manager.settings.session_cookie)):
        return RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)
    return request.app.state.templates.TemplateResponse(
        request,
        "auth/login.html.j2",
        {"error": None, "login_csrf": manager.login_csrf_token()},
    )


@router.post("/login", response_class=HTMLResponse)
async def login_submit(
    request: Request,
    username: str = Form(""),
    password: str = Form(""),
    csrf_token: str = Form(""),
    manager: SessionManager = Depends(get_session_manager),
):
    templates = request.app.state.templates
    ip = _client_ip(request)

    def fail(message: str, code: int = status.HTTP_401_UNAUTHORIZED):
        return templates.TemplateResponse(
            request,
            "auth/login.html.j2",
            {"error": message, "login_csrf": manager.login_csrf_token()},
            status_code=code,
        )

    if not manager.check_login_csrf(csrf_token):
        return fail("Form expired — try again.", status.HTTP_403_FORBIDDEN)
    if manager.throttled(ip):
        return fail("Too many attempts. Wait a few minutes.", status.HTTP_429_TOO_MANY_REQUESTS)
    if not manager.check_credentials(username.strip(), password):
        manager.record_failure(ip)
        return fail("Invalid username or password.")

    manager.clear_failures(ip)
    response = RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)
    response.set_cookie(
        manager.settings.session_cookie,
        manager.create_session(username.strip()),
        max_age=manager.settings.session_max_age,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return response


@router.post("/logout")
async def logout(manager: SessionManager = Depends(get_session_manager)):
    response = RedirectResponse("/login", status_code=status.HTTP_303_SEE_OTHER)
    response.delete_cookie(manager.settings.session_cookie, path="/")
    return response
