import { Agent, useListActivity } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Activity } from "lucide-react";
import { format } from "date-fns";

export function AgentActivity({ agent }: { agent: Agent }) {
  const { t } = useI18n();
  const { data: activity } = useListActivity(agent.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <Activity className="w-5 h-5 me-2 text-primary" />
        <h3 className="text-xl font-display text-white">{t('activity')}</h3>
      </div>

      <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right">
            <thead className="text-xs font-mono text-muted-foreground uppercase bg-black/40 border-b border-white/5">
              <tr>
                <th className="px-6 py-4">{t('timestamp')}</th>
                <th className="px-6 py-4">{t('appName')}</th>
                <th className="px-6 py-4">{t('userMessage')}</th>
                <th className="px-6 py-4">{t('agentResponse')}</th>
              </tr>
            </thead>
            <tbody>
              {activity?.map(entry => (
                <tr key={entry.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 font-mono text-muted-foreground whitespace-nowrap">
                    {format(new Date(entry.createdAt), 'MM-dd HH:mm:ss')}
                  </td>
                  <td className="px-6 py-4 text-primary font-medium whitespace-nowrap">
                    {entry.appName || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 text-white max-w-[200px] truncate" title={entry.userMessage}>
                    {entry.userMessage}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground max-w-[300px] truncate" title={entry.agentResponse}>
                    {entry.agentResponse}
                  </td>
                </tr>
              ))}
              {activity?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground font-mono">
                    {t('noData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
