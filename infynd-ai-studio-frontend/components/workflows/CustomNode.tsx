import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Bot, FileText, Database, Sparkles, MessageSquare } from 'lucide-react';

const icons = {
    agent: <Bot className="w-4 h-4 text-purple-400" />,
    prompt: <FileText className="w-4 h-4 text-blue-400" />,
    kb: <Database className="w-4 h-4 text-emerald-400" />,
    llm: <Sparkles className="w-4 h-4 text-amber-400" />,
    output: <MessageSquare className="w-4 h-4 text-rose-400" />,
};

const CustomNode = ({ data, isConnectable }: any) => {
    return (
        <div className="bg-[#121212] border border-white/10 rounded-xl shadow-xl min-w-[200px] overflow-hidden group hover:border-[#ff5252]/50 transition-colors">
            <div className="px-3 py-2 border-b border-white/5 bg-[#181818] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {icons[data.type as keyof typeof icons] || <Bot className="w-4 h-4 text-gray-400" />}
                    <span className="text-xs font-semibold text-white tracking-wide">{data.label}</span>
                </div>
            </div>

            <div className="p-3 bg-[#0a0a0a]/50">
                {data.description && <p className="text-[10px] text-gray-500 mb-2">{data.description}</p>}

                {data.type === 'prompt' && (
                    <textarea
                        className="w-full bg-[#181818] border border-white/5 rounded p-2 text-xs text-white focus:outline-none focus:border-[#ff5252]/50 nodrag"
                        placeholder="Enter system prompt..."
                        value={data.value || ''}
                        onChange={data.onChange}
                        rows={3}
                    />
                )}
                {data.type === 'agent' && (
                    <select
                        className="w-full bg-[#181818] border border-white/5 rounded p-2 text-xs text-white focus:outline-none focus:border-[#ff5252]/50 nodrag"
                        value={data.value || ''}
                        onChange={data.onChange}
                    >
                        <option value="">Select Agent...</option>
                        {data.options?.map((opt: any) => (
                            <option key={opt.id} value={opt.id}>{opt.name}</option>
                        ))}
                    </select>
                )}
            </div>

            <Handle
                type="target"
                position={Position.Left}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-[#181818] border-2 border-[#ff5252]"
            />
            <Handle
                type="source"
                position={Position.Right}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-[#181818] border-2 border-[#ff5252]"
            />
        </div>
    );
};

export default memo(CustomNode);
