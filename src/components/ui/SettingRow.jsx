// One labelled setting: the name on one side, its control on the other.

export function SettingRow({ label, children }) {
  return (
    <div className="setting">
      <span className="setting-name">{label}</span>
      {children}
    </div>
  );
}
