export default function RuntimeSection({ t, form, setForm }) {
    const strategy = form.pool_strategy || 'round_robin'
    const muteScanHours = (Number(form.runtime?.mute_scan_interval_seconds || 43200) / 3600)
    const muteScanHoursDisplay = Number.isFinite(muteScanHours) ? muteScanHours : 12
    return (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold">{t('settings.runtimeTitle')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <label className="text-sm space-y-2">
                    <span className="text-muted-foreground">{t('settings.accountMaxInflight')}</span>
                    <input
                        type="number"
                        min={1}
                        value={form.runtime.account_max_inflight}
                        onChange={(e) => setForm((prev) => ({
                            ...prev,
                            runtime: { ...prev.runtime, account_max_inflight: Number(e.target.value || 1) },
                        }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2"
                    />
                </label>
                <label className="text-sm space-y-2">
                    <span className="text-muted-foreground">{t('settings.accountMaxQueue')}</span>
                    <input
                        type="number"
                        min={1}
                        value={form.runtime.account_max_queue}
                        onChange={(e) => setForm((prev) => ({
                            ...prev,
                            runtime: { ...prev.runtime, account_max_queue: Number(e.target.value || 1) },
                        }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2"
                    />
                </label>
                <label className="text-sm space-y-2">
                    <span className="text-muted-foreground">{t('settings.globalMaxInflight')}</span>
                    <input
                        type="number"
                        min={1}
                        value={form.runtime.global_max_inflight}
                        onChange={(e) => setForm((prev) => ({
                            ...prev,
                            runtime: { ...prev.runtime, global_max_inflight: Number(e.target.value || 1) },
                        }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2"
                    />
                </label>
                <label className="text-sm space-y-2">
                    <span className="text-muted-foreground">{t('settings.tokenRefreshIntervalHours')}</span>
                    <input
                        type="number"
                        min={1}
                        max={720}
                        step={1}
                        value={form.runtime.token_refresh_interval_hours}
                        onChange={(e) => setForm((prev) => ({
                            ...prev,
                            runtime: { ...prev.runtime, token_refresh_interval_hours: Number(e.target.value || 1) },
                        }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2"
                    />
                </label>
                <label className="text-sm space-y-2 md:col-span-2">
                    <span className="text-muted-foreground">{t('settings.muteScanIntervalHours')}</span>
                    <input
                        type="number"
                        min={0.0083}
                        max={168}
                        step={0.5}
                        value={muteScanHoursDisplay}
                        onChange={(e) => {
                            const hrs = Number(e.target.value)
                            const safe = Number.isFinite(hrs) && hrs > 0 ? hrs : 12
                            setForm((prev) => ({
                                ...prev,
                                runtime: { ...prev.runtime, mute_scan_interval_seconds: Math.max(30, Math.round(safe * 3600)) },
                            }))
                        }}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2"
                    />
                    <p className="text-xs text-muted-foreground">{t('settings.muteScanIntervalDesc')}</p>
                </label>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
                <div>
                    <span className="text-sm font-medium block">{t('settings.poolStrategyTitle')}</span>
                    <span className="text-xs text-muted-foreground block">{t('settings.poolStrategyDesc')}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                        { key: 'round_robin', title: t('settings.poolStrategyRoundRobin'), desc: t('settings.poolStrategyRoundRobinDesc') },
                        { key: 'sticky', title: t('settings.poolStrategySticky'), desc: t('settings.poolStrategyStickyDesc') },
                    ].map(opt => {
                        const active = strategy === opt.key
                        return (
                            <label
                                key={opt.key}
                                className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                                    active
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border bg-background/60 hover:bg-muted/40'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="pool_strategy"
                                    value={opt.key}
                                    checked={active}
                                    onChange={() => setForm((prev) => ({ ...prev, pool_strategy: opt.key }))}
                                    className="mt-1 h-4 w-4"
                                />
                                <div className="space-y-1">
                                    <span className="text-sm font-medium block">{opt.title}</span>
                                    <span className="text-xs text-muted-foreground block">{opt.desc}</span>
                                </div>
                            </label>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
