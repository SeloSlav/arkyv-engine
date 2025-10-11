import React, { useState, useEffect, useRef, useMemo } from 'react';

const TypingDots = () => (
    <span className="inline-flex">
        <span className="animate-pulse">.</span>
        <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>.</span>
        <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>.</span>
    </span>
);

// Helper function to convert markdown-style formatting to HTML
const formatMarkdown = (text) => {
    if (!text || typeof text !== 'string') return text;
    
    let formatted = text;
    
    // Replace ### Heading with larger text (h3 style)
    formatted = formatted.replace(/^### (.+)$/gm, '<span class="text-base font-semibold block mt-2 mb-1">$1</span>');
    
    // Replace **text** with <strong>text</strong> (do this before single asterisks)
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold">$1</strong>');
    
    // Replace *text* with <em>text</em> (italic)
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');
    
    return formatted;
};

const TerminalLine = React.memo(({
    text,
    delay = 0,
    typeSpeed = 50,
    onComplete,
    onStartTyping,
    prefix = '>',
    color = 'text-cyan-400',
    glitch = false,
    prefixColor = 'text-hot-pink',
    messageKind = null,
    onNpcClick = null,
    inConversation = false
}) => {
    const [displayText, setDisplayText] = useState('');
    const [isComplete, setIsComplete] = useState(false);
    const [showCursor, setShowCursor] = useState(true);
    const [imageUrl, setImageUrl] = useState(null);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [portraitUrl, setPortraitUrl] = useState(null);
    const [npcAlias, setNpcAlias] = useState(null);
    const [npcName, setNpcName] = useState(null);
    const hasStarted = useRef(false);
    const currentIndexRef = useRef(0);
    const typeIntervalRef = useRef(null);
    
    // Extract image URL, portrait URL, and NPC info from text if present
    const processedText = useMemo(() => {
        let processed = text;
        
        // Extract room image
        const imageMatch = processed.match(/\[IMAGE:([^\]]+)\]/);
        if (imageMatch) {
            setImageUrl(imageMatch[1]);
            processed = processed.replace(/\[IMAGE:[^\]]+\]\n?/, '');
        } else {
            setImageUrl(null);
        }
        
        // Extract NPC portrait
        const portraitMatch = processed.match(/\[PORTRAIT:([^\]]+)\]/);
        if (portraitMatch) {
            setPortraitUrl(portraitMatch[1]);
            processed = processed.replace(/\[PORTRAIT:[^\]]+\]/, '');
        } else {
            setPortraitUrl(null);
        }
        
        // Extract NPC alias
        const aliasMatch = processed.match(/\[NPCALIAS:([^\]]+)\]/);
        if (aliasMatch) {
            setNpcAlias(aliasMatch[1]);
            processed = processed.replace(/\[NPCALIAS:[^\]]+\]/, '');
            
            // Extract NPC name from the message text (before the colon)
            const nameMatch = processed.match(/^([^:]+):/);
            if (nameMatch) {
                // Strip (alias) from "NPC Name (alias)" format
                const extractedName = nameMatch[1].replace(/\s*\([^)]+\)\s*$/, '').trim();
                setNpcName(extractedName);
            }
        } else {
            setNpcAlias(null);
            setNpcName(null);
        }
        
        return processed;
    }, [text]);

    // console.log(`TerminalLine render: text="${text}", delay=${delay}, displayText="${displayText}"`);

    useEffect(() => {
        // Only reset if the text actually changed
        const shouldReset = displayText === '' || !displayText || displayText.length === 0;

        if (shouldReset) {
            // console.log(`Resetting typing for new text: "${text}"`);
            setDisplayText('');
            setIsComplete(false);
            currentIndexRef.current = 0;

            // Clear any existing interval
            if (typeIntervalRef.current) {
                clearInterval(typeIntervalRef.current);
            }

            const timer = setTimeout(() => {
                // console.log(`Starting typing effect for: "${text}"`);

                // Notify parent that typing has started
                if (onStartTyping) {
                    onStartTyping();
                }

                const typeInterval = setInterval(() => {
                    if (currentIndexRef.current <= processedText.length) {
                        const newText = processedText.slice(0, currentIndexRef.current);
                        // console.log(`Typing progress: "${newText}"`);
                        setDisplayText(newText);
                        currentIndexRef.current++;
                    } else {
                        // console.log(`Typing complete for: "${processedText}"`);
                        clearInterval(typeInterval);
                        setIsComplete(true);
                        if (onComplete) {
                            onComplete();
                        }
                    }
                }, typeSpeed);

                typeIntervalRef.current = typeInterval;

                return () => clearInterval(typeInterval);
            }, delay);

            return () => clearTimeout(timer);
        } else {
            // console.log(`Text already exists, not resetting: "${displayText}"`);
        }
    }, [processedText, delay, typeSpeed, onComplete, onStartTyping, displayText]);

    useEffect(() => {
        const cursorInterval = setInterval(() => {
            setShowCursor(prev => !prev);
        }, 500);

        return () => clearInterval(cursorInterval);
    }, []);

    const isThinking = messageKind === 'npc_typing' || text.includes('is thinking...');
    
    return (
        <>
            {/* Room Image - shown before text content */}
            {imageUrl && (
                <div className="flex justify-center my-4 px-2 md:px-0">
                    <img
                        src={imageUrl}
                        alt="Room visualization"
                        className={`w-full max-w-2xl md:max-w-4xl rounded border border-cyan-400/30 shadow-lg shadow-cyan-400/10 transition-opacity duration-300 ${
                            imageLoaded ? 'opacity-100' : 'opacity-0'
                        }`}
                        style={{
                            aspectRatio: '16/9',
                            imageRendering: 'pixelated'
                        }}
                        onLoad={() => setImageLoaded(true)}
                        loading="lazy"
                        decoding="async"
                    />
                </div>
            )}
            
            {/* Text content with optional portrait */}
            <div className={`font-terminal text-sm ${color} ${glitch ? 'animate-pulse' : ''} min-h-[1.25rem] ${portraitUrl ? 'flex items-start gap-4' : ''}`}>
                {portraitUrl && (
                    <img 
                        src={portraitUrl}
                        alt="NPC portrait"
                        className={`w-24 h-24 rounded-lg border-2 border-purple-400/60 shadow-xl shadow-purple-400/30 flex-shrink-0 ${
                            !inConversation ? 'cursor-pointer hover:border-hot-pink transition-all hover:scale-105' : ''
                        }`}
                        style={{ imageRendering: 'pixelated' }}
                        onClick={() => !inConversation && npcAlias && onNpcClick && onNpcClick(npcAlias)}
                        title={!inConversation && npcAlias ? `Click to talk with ${npcAlias}` : ''}
                    />
                )}
                <div className="flex-1 min-w-0">
                    <span className={`${prefixColor} mr-2`}>{prefix}</span>
                    {isThinking ? (
                        <span className="text-current">
                            {processedText.replace('is thinking...', 'is thinking')}
                            <TypingDots />
                        </span>
                    ) : (
                        <span className="text-current">
                            {npcName && npcAlias && onNpcClick && !inConversation ? (
                                <span
                                    dangerouslySetInnerHTML={{
                                        __html: formatMarkdown(
                                            displayText
                                                .replace(/\n/g, '<br />')
                                                .replace(
                                                    new RegExp(`(${npcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'g'),
                                                    `<span class="cursor-pointer hover:text-hot-pink transition-colors underline decoration-dotted" data-npc-alias="${npcAlias}">$1</span>`
                                                )
                                        ) || '\u00A0'
                                    }}
                                    onClick={(e) => {
                                        const alias = e.target.getAttribute('data-npc-alias');
                                        if (alias && onNpcClick) {
                                            onNpcClick(alias);
                                        }
                                    }}
                                />
                            ) : (
                                <span
                                    dangerouslySetInnerHTML={{
                                        __html: formatMarkdown(displayText.replace(/\n/g, '<br />')) || '\u00A0'
                                    }}
                                />
                            )}
                        </span>
                    )}
                    {!isComplete && showCursor && !isThinking && (
                        <span className="text-hot-pink animate-pulse">█</span>
                    )}
                </div>
            </div>
        </>
    );
});

export default TerminalLine;
