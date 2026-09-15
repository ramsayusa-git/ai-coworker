"""Tables behind the full console: rooms, chat, recordings, tools, knowledge
base, reports, notes and per-tenant settings.

All new tables — nothing is altered, so this migration is additive and safe to
run against a live install. Every one carries tenant_id with an index, because
every query against them goes through scoped().

Revision ID: 0002_console_sections
Revises: 0001_multitenancy
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_console_sections"
down_revision = "0001_multitenancy"
branch_labels = None
depends_on = None

TENANT_FK = sa.ForeignKey("tenants.id")


def _tenant_col():
    return sa.Column("tenant_id", sa.String(), sa.ForeignKey("tenants.id"),
                     nullable=False, server_default="ten_default")


def upgrade() -> None:
    op.create_table(
        "rooms",
        sa.Column("id", sa.String(), primary_key=True),
        _tenant_col(),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False, server_default="voice"),
        sa.Column("status", sa.String(), nullable=False, server_default="idle"),
        sa.Column("agent_id", sa.String(), nullable=True),
        sa.Column("max_participants", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("empty_timeout_s", sa.Integer(), nullable=False, server_default="300"),
        sa.Column("participants", sa.JSON(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("last_active_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("tenant_id", "name", name="uq_room_name"),
    )
    op.create_index("ix_rooms_tenant_id", "rooms", ["tenant_id"])

    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.String(), primary_key=True),
        _tenant_col(),
        sa.Column("agent_id", sa.String(), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("channel", sa.String(), nullable=False, server_default="web"),
        sa.Column("visitor", sa.String(), nullable=False, server_default=""),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tokens_in", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tokens_out", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost", sa.Float(), nullable=False, server_default="0"),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("messages", sa.JSON(), nullable=True),
    )
    op.create_index("ix_chat_sessions_tenant_id", "chat_sessions", ["tenant_id"])
    op.create_index("ix_chat_sessions_started_at", "chat_sessions", ["started_at"])

    op.create_table(
        "recordings",
        sa.Column("id", sa.String(), primary_key=True),
        _tenant_col(),
        sa.Column("session_id", sa.String(), nullable=True),
        sa.Column("room_id", sa.String(), nullable=True),
        sa.Column("kind", sa.String(), nullable=False, server_default="audio"),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("destination", sa.String(), nullable=False, server_default="local"),
        sa.Column("path", sa.String(), nullable=False, server_default=""),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duration_s", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=False, server_default=""),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_recordings_tenant_id", "recordings", ["tenant_id"])
    op.create_index("ix_recordings_session_id", "recordings", ["session_id"])
    op.create_index("ix_recordings_started_at", "recordings", ["started_at"])

    op.create_table(
        "tools",
        sa.Column("id", sa.String(), primary_key=True),
        _tenant_col(),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False, server_default="http"),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("method", sa.String(), nullable=False, server_default="POST"),
        sa.Column("url", sa.String(), nullable=False, server_default=""),
        sa.Column("headers", sa.JSON(), nullable=True),
        sa.Column("parameters", sa.JSON(), nullable=True),
        sa.Column("timeout_s", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("tenant_id", "name", name="uq_tool_name"),
    )
    op.create_index("ix_tools_tenant_id", "tools", ["tenant_id"])

    op.create_table(
        "knowledge_bases",
        sa.Column("id", sa.String(), primary_key=True),
        _tenant_col(),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("embedding_model", sa.String(), nullable=False, server_default="local-minilm"),
        sa.Column("chunk_size", sa.Integer(), nullable=False, server_default="800"),
        sa.Column("chunk_overlap", sa.Integer(), nullable=False, server_default="120"),
        sa.Column("doc_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("tenant_id", "name", name="uq_kb_name"),
    )
    op.create_index("ix_knowledge_bases_tenant_id", "knowledge_bases", ["tenant_id"])

    op.create_table(
        "kb_documents",
        sa.Column("id", sa.String(), primary_key=True),
        _tenant_col(),
        sa.Column("kb_id", sa.String(), sa.ForeignKey("knowledge_bases.id"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False, server_default="upload"),
        sa.Column("uri", sa.String(), nullable=False, server_default=""),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("chunks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_kb_documents_tenant_id", "kb_documents", ["tenant_id"])
    op.create_index("ix_kb_documents_kb_id", "kb_documents", ["kb_id"])

    op.create_table(
        "reports",
        sa.Column("id", sa.String(), primary_key=True),
        _tenant_col(),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False, server_default="calls"),
        sa.Column("window", sa.String(), nullable=False, server_default="7d"),
        sa.Column("filters", sa.JSON(), nullable=True),
        sa.Column("schedule", sa.String(), nullable=False, server_default=""),
        sa.Column("recipients", sa.JSON(), nullable=True),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_reports_tenant_id", "reports", ["tenant_id"])

    op.create_table(
        "notes",
        sa.Column("id", sa.String(), primary_key=True),
        _tenant_col(),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False, server_default="guide"),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_notes_tenant_id", "notes", ["tenant_id"])

    op.create_table(
        "tenant_settings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column("group", sa.String(), nullable=False),
        sa.Column("value", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("updated_by", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("tenant_id", "group", name="uq_setting_group"),
    )
    op.create_index("ix_tenant_settings_tenant_id", "tenant_settings", ["tenant_id"])


def downgrade() -> None:
    for t in ("tenant_settings", "notes", "reports", "kb_documents",
              "knowledge_bases", "tools", "recordings", "chat_sessions", "rooms"):
        op.drop_table(t)
