import React, { useCallback, useEffect, useMemo, useState } from 'react';
import getSpacetimeClient from '@/lib/spacetimedbClient';

const inputClass = 'w-full rounded-md border border-slate-600/70 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none';
const buttonClass = 'rounded-md border border-cyan-400/50 bg-cyan-500/10 px-3 py-2 text-[0.65rem] uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40';

const freshId = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || Date.now()}`;

const emptyNode = (npcId, entryNode = false) => ({
    id: freshId(`${npcId}-dialogue`),
    npc_id: npcId,
    text: '',
    entry_node: entryNode,
    required_quest_id: null,
    required_faction_id: null,
    required_reputation: 0,
    sort_order: 100,
});

const emptyChoice = (nodeId) => ({
    id: freshId(`${nodeId}-choice`),
    node_id: nodeId,
    label: '',
    next_node_id: null,
    action_kind: 'none',
    action_reference_id: null,
    action_value: 0,
    sort_order: 100,
});

const sortByOrder = (left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0)
    || String(left.id).localeCompare(String(right.id));

const actionLabels = {
    none: 'No action',
    start_quest: 'Start quest',
    gold: 'Change gold',
    reputation: 'Change reputation',
    give_item: 'Give item',
    learn_recipe: 'Teach recipe',
    learn_profession: 'Teach profession',
};

export default function NpcDialogueEditor({ npcId, npcName, npcAlias }) {
    const spacetime = useMemo(() => getSpacetimeClient(), []);
    const [nodes, setNodes] = useState([]);
    const [choices, setChoices] = useState([]);
    const [quests, setQuests] = useState([]);
    const [factions, setFactions] = useState([]);
    const [items, setItems] = useState([]);
    const [recipes, setRecipes] = useState([]);
    const [professions, setProfessions] = useState([]);
    const [selectedNodeId, setSelectedNodeId] = useState('');
    const [nodeForm, setNodeForm] = useState(() => emptyNode(npcId, true));
    const [choiceForm, setChoiceForm] = useState(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);

    const load = useCallback(async (preferredNodeId = '') => {
        const [nodeResult, questResult, factionResult, itemResult, recipeResult, professionResult] = await Promise.all([
            spacetime.from('dialogue_nodes').select('*').eq('npc_id', npcId),
            spacetime.from('quest_definitions').select('id, title').order('title'),
            spacetime.from('faction_definitions').select('id, name').order('name'),
            spacetime.from('object_definitions').select('id, name').order('name'),
            spacetime.from('crafting_recipes').select('id, name').order('name'),
            spacetime.from('profession_definitions').select('id, name').order('name'),
        ]);
        if (nodeResult.error) throw nodeResult.error;
        const nextNodes = [...(nodeResult.data || [])].sort(sortByOrder);
        const nodeIds = nextNodes.map((node) => node.id);
        const choiceResult = nodeIds.length
            ? await spacetime.from('dialogue_choices').select('*').in('node_id', nodeIds)
            : { data: [], error: null };
        if (choiceResult.error) throw choiceResult.error;

        setNodes(nextNodes);
        setChoices([...(choiceResult.data || [])].sort(sortByOrder));
        setQuests(questResult.data || []);
        setFactions(factionResult.data || []);
        setItems(itemResult.data || []);
        setRecipes(recipeResult.data || []);
        setProfessions(professionResult.data || []);

        const nextSelectedId = nextNodes.some((node) => node.id === preferredNodeId)
            ? preferredNodeId
            : nextNodes.some((node) => node.id === selectedNodeId)
                ? selectedNodeId
                : nextNodes[0]?.id || '';
        const selected = nextNodes.find((node) => node.id === nextSelectedId);
        setSelectedNodeId(nextSelectedId);
        setNodeForm(selected ? { ...selected } : emptyNode(npcId, nextNodes.length === 0));
        setChoiceForm(null);
    }, [npcId, selectedNodeId, spacetime]);

    useEffect(() => {
        let active = true;
        setMessage(null);
        load().catch((error) => {
            if (active) setMessage({ type: 'error', text: error?.message || String(error) });
        });
        return () => { active = false; };
    }, [load]);

    const run = async (operation, success, preferredNodeId = selectedNodeId) => {
        setBusy(true);
        setMessage(null);
        try {
            const result = await operation();
            if (result?.error) throw result.error;
            await load(preferredNodeId);
            setMessage({ type: 'success', text: success });
        } catch (error) {
            setMessage({ type: 'error', text: error?.message || String(error) });
        } finally {
            setBusy(false);
        }
    };

    const chooseNode = (node) => {
        setSelectedNodeId(node.id);
        setNodeForm({ ...node });
        setChoiceForm(null);
        setMessage(null);
    };

    const beginNode = () => {
        setSelectedNodeId('');
        setNodeForm(emptyNode(npcId, nodes.length === 0));
        setChoiceForm(null);
        setMessage(null);
    };

    const saveNode = () => {
        const text = nodeForm.text.trim();
        if (!text) {
            setMessage({ type: 'error', text: 'Add the words this NPC should say.' });
            return;
        }
        const payload = {
            ...nodeForm,
            npc_id: npcId,
            text,
            entry_node: Boolean(nodeForm.entry_node),
            required_quest_id: nodeForm.required_quest_id || null,
            required_faction_id: nodeForm.required_faction_id || null,
            required_reputation: Number(nodeForm.required_reputation) || 0,
            sort_order: Math.max(0, Number(nodeForm.sort_order) || 0),
        };
        run(
            () => spacetime.configureEngineRecord('dialogue_nodes', payload),
            selectedNodeId ? 'Dialogue line saved.' : 'Dialogue line added.',
            payload.id,
        );
    };

    const deleteNode = () => {
        if (!selectedNodeId || !window.confirm('Delete this dialogue line and all of its player responses?')) return;
        run(
            () => spacetime.deleteEngineRecord('dialogue_nodes', selectedNodeId),
            'Dialogue line deleted.',
            '',
        );
    };

    const saveChoice = () => {
        const label = choiceForm?.label?.trim();
        if (!label) {
            setMessage({ type: 'error', text: 'Add the response shown to the player.' });
            return;
        }
        const payload = {
            ...choiceForm,
            node_id: selectedNodeId,
            label,
            next_node_id: choiceForm.next_node_id || null,
            action_kind: choiceForm.action_kind || 'none',
            action_reference_id: choiceForm.action_reference_id || null,
            action_value: Number(choiceForm.action_value) || 0,
            sort_order: Math.max(0, Number(choiceForm.sort_order) || 0),
        };
        run(
            () => spacetime.configureEngineRecord('dialogue_choices', payload),
            choices.some((choice) => choice.id === payload.id) ? 'Player response saved.' : 'Player response added.',
            selectedNodeId,
        );
    };

    const deleteChoice = () => {
        if (!choiceForm?.id || !choices.some((choice) => choice.id === choiceForm.id)) return;
        run(
            () => spacetime.deleteEngineRecord('dialogue_choices', choiceForm.id),
            'Player response deleted.',
            selectedNodeId,
        );
    };

    const authoredActive = nodes.some((node) => node.entry_node);
    const selectedChoices = choices.filter((choice) => choice.node_id === selectedNodeId);
    const actionReferenceOptions = choiceForm?.action_kind === 'start_quest' ? quests
        : choiceForm?.action_kind === 'reputation' ? factions
            : choiceForm?.action_kind === 'give_item' ? items
                : choiceForm?.action_kind === 'learn_recipe' ? recipes
                    : choiceForm?.action_kind === 'learn_profession' ? professions
                        : [];
    const actionNeedsReference = actionReferenceOptions.length > 0
        || ['start_quest', 'reputation', 'give_item', 'learn_recipe', 'learn_profession'].includes(choiceForm?.action_kind);
    const actionNeedsValue = ['gold', 'reputation', 'give_item', 'learn_profession'].includes(choiceForm?.action_kind);

    return (
        <section className="md:col-span-2 rounded-xl border border-cyan-400/25 bg-cyan-500/[0.04] p-4 normal-case tracking-normal">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Authored dialogue tree</p>
                    <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">
                        Opening lines override AI replies for {npcName || 'this NPC'}. A line with no player responses is a complete one-line conversation, so it repeats every time a player uses <code className="text-pink-300">talk {npcAlias || '<alias>'}</code>.
                    </p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[0.62rem] uppercase tracking-[0.18em] ${authoredActive ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-amber-400/40 bg-amber-500/10 text-amber-200'}`}>
                    {authoredActive ? 'Authored replies active' : 'AI replies active'}
                </span>
            </div>

            {message && (
                <div className={`mt-4 rounded-md border px-3 py-2 text-xs ${message.type === 'error' ? 'border-rose-500/40 bg-rose-500/10 text-rose-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}>
                    {message.text}
                </div>
            )}

            <div className="mt-4 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">NPC lines</span>
                        <button type="button" onClick={beginNode} disabled={busy} className={buttonClass}>Add line</button>
                    </div>
                    {nodes.length === 0 && (
                        <p className="rounded-lg border border-dashed border-slate-700 p-3 text-xs leading-5 text-slate-500">
                            No authored reply yet. Add one opening line for the simplest non-AI NPC.
                        </p>
                    )}
                    {nodes.map((node) => (
                        <button
                            key={node.id}
                            type="button"
                            onClick={() => chooseNode(node)}
                            className={`w-full rounded-lg border p-3 text-left transition ${selectedNodeId === node.id ? 'border-cyan-300/60 bg-cyan-500/10' : 'border-slate-700 bg-slate-950/40 hover:border-slate-500'}`}
                        >
                            <span className="block truncate text-xs text-slate-100">{node.text}</span>
                            <span className="mt-1 block text-[0.6rem] uppercase tracking-[0.16em] text-slate-500">
                                {node.entry_node ? 'Opening line' : 'Follow-up'} · {choices.filter((choice) => choice.node_id === node.id).length} response(s)
                            </span>
                        </button>
                    ))}
                </div>

                <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-950/35 p-4">
                    <label className="block text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">
                        NPC says
                        <textarea
                            value={nodeForm.text}
                            onChange={(event) => setNodeForm((value) => ({ ...value, text: event.target.value }))}
                            rows={4}
                            placeholder={`What does ${npcName || 'the NPC'} say?`}
                            className={`${inputClass} mt-2 normal-case tracking-normal`}
                        />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300">
                            <input
                                type="checkbox"
                                checked={Boolean(nodeForm.entry_node)}
                                onChange={(event) => setNodeForm((value) => ({ ...value, entry_node: event.target.checked }))}
                            />
                            Can start a conversation
                        </label>
                        <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">
                            Priority
                            <input
                                type="number"
                                min="0"
                                value={nodeForm.sort_order}
                                onChange={(event) => setNodeForm((value) => ({ ...value, sort_order: event.target.value }))}
                                className={`${inputClass} mt-2`}
                            />
                        </label>
                        <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">
                            Requires completed quest
                            <select
                                value={nodeForm.required_quest_id || ''}
                                onChange={(event) => setNodeForm((value) => ({ ...value, required_quest_id: event.target.value || null }))}
                                className={`${inputClass} mt-2 normal-case tracking-normal`}
                            >
                                <option value="">None</option>
                                {quests.map((quest) => <option key={quest.id} value={quest.id}>{quest.title || quest.id}</option>)}
                            </select>
                        </label>
                        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-2">
                            <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">
                                Requires faction
                                <select
                                    value={nodeForm.required_faction_id || ''}
                                    onChange={(event) => setNodeForm((value) => ({ ...value, required_faction_id: event.target.value || null }))}
                                    className={`${inputClass} mt-2 normal-case tracking-normal`}
                                >
                                    <option value="">None</option>
                                    {factions.map((faction) => <option key={faction.id} value={faction.id}>{faction.name || faction.id}</option>)}
                                </select>
                            </label>
                            <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">
                                Min rep
                                <input
                                    type="number"
                                    value={nodeForm.required_reputation}
                                    disabled={!nodeForm.required_faction_id}
                                    onChange={(event) => setNodeForm((value) => ({ ...value, required_reputation: event.target.value }))}
                                    className={`${inputClass} mt-2`}
                                />
                            </label>
                        </div>
                    </div>

                    <div className="flex flex-wrap justify-between gap-2">
                        <button type="button" onClick={deleteNode} disabled={busy || !selectedNodeId} className="rounded-md border border-rose-500/50 px-3 py-2 text-[0.65rem] uppercase tracking-[0.16em] text-rose-200 disabled:opacity-30">Delete line</button>
                        <button type="button" onClick={saveNode} disabled={busy || !nodeForm.text.trim()} className={buttonClass}>
                            {busy ? 'Saving...' : selectedNodeId ? 'Save line' : nodes.length === 0 ? 'Save repeating line' : 'Add line'}
                        </button>
                    </div>

                    {selectedNodeId && (
                        <div className="border-t border-slate-700 pt-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <p className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">Player responses</p>
                                    <p className="mt-1 text-xs text-slate-500">Leave this empty when the NPC should only repeat the line above.</p>
                                </div>
                                <button type="button" onClick={() => setChoiceForm(emptyChoice(selectedNodeId))} disabled={busy} className={buttonClass}>Add response</button>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                {selectedChoices.map((choice) => (
                                    <button
                                        key={choice.id}
                                        type="button"
                                        onClick={() => setChoiceForm({ ...choice })}
                                        className={`rounded-full border px-3 py-1.5 text-xs ${choiceForm?.id === choice.id ? 'border-pink-300/60 bg-pink-500/10 text-pink-100' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                                    >
                                        {choice.label}
                                    </button>
                                ))}
                            </div>

                            {choiceForm && (
                                <div className="mt-4 space-y-3 rounded-lg border border-pink-400/20 bg-pink-500/[0.04] p-3">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">
                                            Player says
                                            <input
                                                value={choiceForm.label}
                                                onChange={(event) => setChoiceForm((value) => ({ ...value, label: event.target.value }))}
                                                placeholder="Ask about the old road"
                                                className={`${inputClass} mt-2 normal-case tracking-normal`}
                                            />
                                        </label>
                                        <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">
                                            Then
                                            <select
                                                value={choiceForm.next_node_id || ''}
                                                onChange={(event) => setChoiceForm((value) => ({ ...value, next_node_id: event.target.value || null }))}
                                                className={`${inputClass} mt-2 normal-case tracking-normal`}
                                            >
                                                <option value="">End conversation</option>
                                                {nodes.map((node) => <option key={node.id} value={node.id}>{node.text}</option>)}
                                            </select>
                                        </label>
                                        <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">
                                            Optional action
                                            <select
                                                value={choiceForm.action_kind}
                                                onChange={(event) => setChoiceForm((value) => ({ ...value, action_kind: event.target.value, action_reference_id: null, action_value: 0 }))}
                                                className={`${inputClass} mt-2 normal-case tracking-normal`}
                                            >
                                                {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                            </select>
                                        </label>
                                        <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">
                                            Response order
                                            <input
                                                type="number"
                                                min="0"
                                                value={choiceForm.sort_order}
                                                onChange={(event) => setChoiceForm((value) => ({ ...value, sort_order: event.target.value }))}
                                                className={`${inputClass} mt-2`}
                                            />
                                        </label>
                                        {actionNeedsReference && (
                                            <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">
                                                Action target
                                                <select
                                                    value={choiceForm.action_reference_id || ''}
                                                    onChange={(event) => setChoiceForm((value) => ({ ...value, action_reference_id: event.target.value || null }))}
                                                    className={`${inputClass} mt-2 normal-case tracking-normal`}
                                                >
                                                    <option value="">Choose...</option>
                                                    {actionReferenceOptions.map((option) => <option key={option.id} value={option.id}>{option.title || option.name || option.id}</option>)}
                                                </select>
                                            </label>
                                        )}
                                        {actionNeedsValue && (
                                            <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">
                                                {choiceForm.action_kind === 'give_item' ? 'Quantity' : choiceForm.action_kind === 'learn_profession' ? 'Starting rank' : 'Amount'}
                                                <input
                                                    type="number"
                                                    value={choiceForm.action_value}
                                                    onChange={(event) => setChoiceForm((value) => ({ ...value, action_value: event.target.value }))}
                                                    className={`${inputClass} mt-2`}
                                                />
                                            </label>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap justify-between gap-2">
                                        <button type="button" onClick={deleteChoice} disabled={busy || !choices.some((choice) => choice.id === choiceForm.id)} className="rounded-md border border-rose-500/50 px-3 py-2 text-[0.65rem] uppercase tracking-[0.16em] text-rose-200 disabled:opacity-30">Delete response</button>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => setChoiceForm(null)} disabled={busy} className="rounded-md border border-slate-600 px-3 py-2 text-[0.65rem] uppercase tracking-[0.16em] text-slate-300">Cancel</button>
                                            <button type="button" onClick={saveChoice} disabled={busy || !choiceForm.label.trim()} className={buttonClass}>Save response</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
