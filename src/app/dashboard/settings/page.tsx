"use client";

import { useEffect, useState } from "react";

const WEEKDAY_LABEL = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

type ScheduleEntry = {
  weekday: number;
  start_time: string;
  end_time: string;
  _id?: string;
  // id job tương ứng trên cron-job.org — chỉ để hiển thị/round-trip, không chỉnh sửa trực tiếp ở UI.
  cronjob_id?: number;
};
type Settings = {
  club_name: string;
  main_group_chat_id?: number;
  admin_group_chat_id?: number;
  bot_username?: string;
  weekly_schedule: ScheduleEntry[];
  required_participants: number;
  fixed_cost_per_session: number;
  reminder_hours_before: number;
  cost_survey_minutes_after: number;
  monthly_settlement_day: number;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings);
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const updated = await res.json();
    setSettings(updated);
    setWarnings(updated.warnings ?? []);
    setSaving(false);
    setSavedAt(Date.now());
  }

  function addScheduleEntry() {
    if (!settings) return;
    setSettings({
      ...settings,
      weekly_schedule: [...settings.weekly_schedule, { weekday: 1, start_time: "18:30", end_time: "20:00" }],
    });
  }

  function updateScheduleEntry(index: number, entry: Partial<ScheduleEntry>) {
    if (!settings) return;
    const next = [...settings.weekly_schedule];
    next[index] = { ...next[index], ...entry };
    setSettings({ ...settings, weekly_schedule: next });
  }

  function removeScheduleEntry(index: number) {
    if (!settings) return;
    setSettings({ ...settings, weekly_schedule: settings.weekly_schedule.filter((_, i) => i !== index) });
  }

  if (!settings) return <p className="text-sm text-zinc-400">Đang tải...</p>;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-700">Thông tin chung</h2>
        <LabeledInput
          label="Tên CLB"
          value={settings.club_name}
          onChange={(v) => setSettings({ ...settings, club_name: v })}
        />
        <LabeledInput
          label="Chat ID nhóm chính (①)"
          type="number"
          value={settings.main_group_chat_id ?? ""}
          onChange={(v) => setSettings({ ...settings, main_group_chat_id: Number(v) })}
        />
        <LabeledInput
          label="Chat ID nhóm Ban quản trị (②)"
          type="number"
          value={settings.admin_group_chat_id ?? ""}
          onChange={(v) => setSettings({ ...settings, admin_group_chat_id: Number(v) })}
        />
        <p className="text-xs text-zinc-400">
          Mẹo: thêm bot vào nhóm rồi gõ lệnh <code>/getid</code> trong nhóm đó để lấy Chat ID.
        </p>
        <LabeledInput
          label="Username bot Telegram"
          value={settings.bot_username ?? ""}
          onChange={(v) => setSettings({ ...settings, bot_username: v })}
        />
        <p className="text-xs text-zinc-400">
          Lấy từ @BotFather, không kèm ký tự @. Dùng để dựng link điểm danh gửi vào nhóm — thiếu
          thông tin này thì không gửi được thông báo điểm danh.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-700">Lịch tập hàng tuần</h2>
        <LabeledInput
          label="Số lượng tham gia mỗi buổi"
          type="number"
          value={settings.required_participants}
          onChange={(v) => setSettings({ ...settings, required_participants: Number(v) })}
        />
        <LabeledInput
          label="Chi phí cố định mỗi buổi (đ)"
          type="number"
          value={settings.fixed_cost_per_session}
          onChange={(v) => setSettings({ ...settings, fixed_cost_per_session: Number(v) })}
        />
        {settings.weekly_schedule.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={entry.weekday}
              onChange={(e) => updateScheduleEntry(i, { weekday: Number(e.target.value) })}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
            >
              {WEEKDAY_LABEL.map((label, wd) => (
                <option key={wd} value={wd}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={entry.start_time}
              onChange={(e) => updateScheduleEntry(i, { start_time: e.target.value })}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
            />
            <input
              type="time"
              value={entry.end_time}
              onChange={(e) => updateScheduleEntry(i, { end_time: e.target.value })}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
            />
            <button onClick={() => removeScheduleEntry(i)} className="text-xs text-red-500">
              Xoá
            </button>
          </div>
        ))}
        <button onClick={addScheduleEntry} className="self-start text-xs font-medium text-zinc-600 underline">
          + Thêm lịch tập
        </button>
        <p className="text-xs text-zinc-400">
          Cron sẽ tự tạo buổi tập & gửi thông báo điểm danh dựa theo lịch này (khi đã bật cron ngoài, xem README).
          Số lượng tham gia ở trên dùng làm mốc &quot;đủ/thiếu người&quot; và số người tối thiểu mặc
          định cho buổi được tự tạo. Chi phí cố định được cộng thêm vào chi phí vật phẩm của mỗi
          buổi khi tính sao kê.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-700">Mốc thời gian tự động</h2>
        <LabeledInput
          label="Gửi thông báo điểm danh trước giờ tập bao nhiêu tiếng"
          type="number"
          value={settings.reminder_hours_before}
          onChange={(v) => setSettings({ ...settings, reminder_hours_before: Number(v) })}
        />
        <LabeledInput
          label="Nhắc nhập chi phí sau khi kết thúc bao nhiêu phút"
          type="number"
          value={settings.cost_survey_minutes_after}
          onChange={(v) => setSettings({ ...settings, cost_survey_minutes_after: Number(v) })}
        />
        <LabeledInput
          label="Ngày chốt sao kê hàng tháng (1-28)"
          type="number"
          value={settings.monthly_settlement_day}
          onChange={(v) => setSettings({ ...settings, monthly_settlement_day: Number(v) })}
        />
      </section>

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {saving ? "Đang lưu..." : savedAt ? "Đã lưu ✓" : "Lưu cấu hình"}
      </button>
      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          {warnings.map((w, i) => (
            <li key={i}>⚠️ {w}</li>
          ))}
        </ul>
      )}

      <ItemConfigsSection />
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-zinc-300 px-2 py-1.5"
      />
    </label>
  );
}

type ItemConfig = { _id: string; name: string; unit: string; unit_price: number };

function ItemConfigsSection() {
  const [items, setItems] = useState<ItemConfig[] | null>(null);
  const [form, setForm] = useState({ name: "", unit: "", unit_price: 0 });

  function load() {
    fetch("/api/item-configs")
      .then((r) => r.json())
      .then(setItems);
  }

  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/item-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ name: "", unit: "", unit_price: 0 });
    load();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/item-configs/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-700">Danh mục vật phẩm & đơn giá</h2>
      {items?.map((item) => (
        <div key={item._id} className="flex items-center justify-between text-sm">
          <span>
            {item.name} — {item.unit_price.toLocaleString("vi-VN")}đ/{item.unit}
          </span>
          <button onClick={() => handleDelete(item._id)} className="text-xs text-red-500">
            Xoá
          </button>
        </div>
      ))}
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
        <LabeledInput label="Tên vật phẩm" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <LabeledInput label="Đơn vị" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} />
        <LabeledInput
          label="Đơn giá"
          type="number"
          value={form.unit_price}
          onChange={(v) => setForm({ ...form, unit_price: Number(v) })}
        />
        <button className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium">Thêm</button>
      </form>
    </section>
  );
}
