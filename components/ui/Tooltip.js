import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Tooltip({ children, content, position = 'top' }) {
    const [isVisible, setIsVisible] = useState(false);
    const [tooltipStyle, setTooltipStyle] = useState({});
    const [arrowStyle, setArrowStyle] = useState({});
    const triggerRef = useRef(null);

    useEffect(() => {
        if (isVisible && triggerRef.current && content) {
            const triggerRect = triggerRef.current.getBoundingClientRect();
            const tooltipWidth = 200; // Approximate tooltip width
            const tooltipHeight = 40; // Approximate tooltip height
            const arrowSize = 8; // Arrow size
            
            // Check if we're inside a modal
            const modalContainer = triggerRef.current.closest('[class*="fixed"][class*="inset-0"]');
            
            let tooltipPosition = {};
            let arrowPosition = {};
            
            if (modalContainer) {
                // Inside modal - always position above the modal content
                const modalRect = modalContainer.getBoundingClientRect();
                const spaceAbove = triggerRect.top - modalRect.top;
                
                if (spaceAbove > tooltipHeight + 20) {
                    // Position above the trigger
                    tooltipPosition = {
                        position: 'fixed',
                        left: triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2,
                        top: triggerRect.top - tooltipHeight - 8,
                        zIndex: 99999,
                    };
                    arrowPosition = {
                        position: 'fixed',
                        left: triggerRect.left + triggerRect.width / 2 - arrowSize / 2,
                        top: triggerRect.top - 8,
                        zIndex: 99999,
                    };
                } else {
                    // Not enough space above, position below but above modal
                    tooltipPosition = {
                        position: 'fixed',
                        left: triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2,
                        top: modalRect.top + 20,
                        zIndex: 99999,
                    };
                    arrowPosition = {
                        position: 'fixed',
                        left: triggerRect.left + triggerRect.width / 2 - arrowSize / 2,
                        top: modalRect.top + 20 + tooltipHeight,
                        zIndex: 99999,
                    };
                }
            } else {
                // Outside modal - use original positioning logic
                switch (position) {
                    case 'top':
                        tooltipPosition = {
                            position: 'fixed',
                            left: triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2,
                            top: triggerRect.top - tooltipHeight - 8,
                            zIndex: 99999,
                        };
                        arrowPosition = {
                            position: 'fixed',
                            left: triggerRect.left + triggerRect.width / 2 - arrowSize / 2,
                            top: triggerRect.top - 8,
                            zIndex: 99999,
                        };
                        break;
                    case 'bottom':
                        tooltipPosition = {
                            position: 'fixed',
                            left: triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2,
                            top: triggerRect.bottom + 8,
                            zIndex: 99999,
                        };
                        arrowPosition = {
                            position: 'fixed',
                            left: triggerRect.left + triggerRect.width / 2 - arrowSize / 2,
                            top: triggerRect.bottom,
                            zIndex: 99999,
                        };
                        break;
                    case 'left':
                        tooltipPosition = {
                            position: 'fixed',
                            left: triggerRect.left - tooltipWidth - 8,
                            top: triggerRect.top + triggerRect.height / 2 - tooltipHeight / 2,
                            zIndex: 99999,
                        };
                        arrowPosition = {
                            position: 'fixed',
                            left: triggerRect.left - 8,
                            top: triggerRect.top + triggerRect.height / 2 - arrowSize / 2,
                            zIndex: 99999,
                        };
                        break;
                    case 'right':
                        tooltipPosition = {
                            position: 'fixed',
                            left: triggerRect.right + 8,
                            top: triggerRect.top + triggerRect.height / 2 - tooltipHeight / 2,
                            zIndex: 99999,
                        };
                        arrowPosition = {
                            position: 'fixed',
                            left: triggerRect.right,
                            top: triggerRect.top + triggerRect.height / 2 - arrowSize / 2,
                            zIndex: 99999,
                        };
                        break;
                }
            }
            
            setTooltipStyle(tooltipPosition);
            setArrowStyle(arrowPosition);
        }
    }, [isVisible, content, position]);

    const tooltipContent = isVisible && content ? (
        <>
            <div
                className="fixed pointer-events-none bg-slate-900 border border-cyan-400/60 rounded-md px-3 py-2 shadow-xl shadow-cyan-400/20 backdrop-blur-sm"
                style={{ ...tooltipStyle, whiteSpace: 'nowrap' }}
            >
                <p className="font-terminal text-[0.65rem] text-cyan-100 tracking-[0.15em] uppercase">
                    {content}
                </p>
            </div>
            <div
                className="fixed w-0 h-0 border-4 border-l-transparent border-r-transparent border-b-transparent border-t-cyan-400/80"
                style={arrowStyle}
            />
        </>
    ) : null;

    return (
        <>
            <div
                ref={triggerRef}
                className="relative inline-block"
                onMouseEnter={() => setIsVisible(true)}
                onMouseLeave={() => setIsVisible(false)}
            >
                {children}
            </div>
            {tooltipContent && createPortal(tooltipContent, document.body)}
        </>
    );
}

