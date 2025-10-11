import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import TerminalLine from './TerminalLine';

const Loader = React.memo(({ onLoadingComplete, showEntryButton }) => {
    const router = useRouter();
    const [progress, setProgress] = useState(0);
    const [completedSteps, setCompletedSteps] = useState([]);
    const [visibleSteps, setVisibleSteps] = useState([]);
    const terminalRef = useRef(null);

    const loadingSteps = [
        { text: "Initializing quantum encryption protocols...", delay: 0, color: "text-cyan-400" },
        { text: "Establishing secure tunnel to Babachain...", delay: 1500, color: "text-purple-400" },
        { text: "Connecting to zk-rollup layer-2 network...", delay: 3000, color: "text-hot-pink" },
        { text: "Validating Oracle consensus mechanisms...", delay: 4500, color: "text-baby-blue" },
        { text: "Synchronizing with Gred mainframe clusters...", delay: 6000, color: "text-green-400" },
        { text: "Loading distributed ledger state...", delay: 7500, color: "text-yellow-400" },
        { text: "Decrypting Arkyv access permissions...", delay: 9000, color: "text-cyan-400" },
        { text: "Verifying biometric authentication...", delay: 10500, color: "text-purple-400" },
        { text: "Establishing neural interface link...", delay: 12000, color: "text-hot-pink" },
        { text: "Loading Babushka AI personality matrix...", delay: 13500, color: "text-baby-blue" },
        { text: "Calibrating temporal synchronization...", delay: 15000, color: "text-green-400" },
        { text: "Finalizing secure connection handshake...", delay: 16500, color: "text-yellow-400" },
        { text: "Authentication protocols verified.", delay: 18000, color: "text-green-400" },
        { text: "Connection established. Ready for entry.", delay: 19500, color: "text-hot-pink" }
    ];

    // Handle step progression
    useEffect(() => {
        if (!showEntryButton) {
            console.log('Setting up step timers...');
            const stepTimers = loadingSteps.map((step, index) => {
                return setTimeout(() => {
                    console.log(`Adding step ${index} to visible steps`);
                    setVisibleSteps(prev => {
                        const newSteps = [...prev, index];
                        console.log('New visibleSteps:', newSteps);
                        return newSteps;
                    });
                }, step.delay);
            });

            return () => {
                stepTimers.forEach(timer => clearTimeout(timer));
            };
        }
    }, [showEntryButton]);

    // Auto-scroll terminal when new steps are added
    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [visibleSteps]);

    // Memoize the terminal lines to prevent unnecessary re-renders
    const terminalLines = useMemo(() => {
        console.log('Rendering terminal lines for visibleSteps:', visibleSteps);
        return visibleSteps.map((stepIndex) => {
            const step = loadingSteps[stepIndex];
            if (!step) return null;

            console.log(`Rendering step ${stepIndex}:`, step.text);
            return (
                <div key={`step-container-${stepIndex}`} className="p-2 rounded bg-gray-800 bg-opacity-50">
                    <TerminalLine
                        key={`terminal-line-${stepIndex}`}
                        text={step.text}
                        delay={0}
                        typeSpeed={50}
                        color={step.color}
                        onComplete={() => handleStepComplete(stepIndex)}
                        glitch={false}
                    />
                </div>
            );
        });
    }, [visibleSteps]);

    // Handle progress bar
    useEffect(() => {
        if (!showEntryButton) {
            const progressInterval = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 100) {
                        clearInterval(progressInterval);
                        // Only call onLoadingComplete when we want to show the button
                        setTimeout(() => {
                            if (onLoadingComplete) onLoadingComplete();
                        }, 2000);
                        return 100;
                    }
                    return prev + Math.random() * 3; // Slower progress
                });
            }, 600); // Slower interval

            return () => clearInterval(progressInterval);
        }
    }, [onLoadingComplete, showEntryButton]);

    const handleStepComplete = (stepIndex) => {
        setCompletedSteps(prev => [...prev, stepIndex]);
    };

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
            {/* Animated background grid */}
            <div className="absolute inset-0 opacity-20">
                <div className="grid-background"></div>
            </div>

            {/* Glitch effects */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="glitch-overlay"></div>
            </div>

            <div className="relative z-10 w-full max-w-4xl p-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="mb-6">
                        <img
                            src="/arkyv_logo.jpg"
                            alt="Arkyv Logo"
                            className="w-32 h-32 mx-auto mb-4 drop-shadow-lg"
                        />
                    </div>
                    <p className="text-baby-blue font-terminal text-lg">
                        Babachain Layer-2 Archive System
                    </p>
                </div>

                {/* Terminal Window */}
                <div className="bg-gray-900 border border-cyan-400 rounded-lg p-6 shadow-2xl shadow-cyan-400/20">
                    <div className="flex items-center mb-4">
                        <div className="flex space-x-2">
                            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        </div>
                        <div className="flex-1 text-center">
                            <span className="text-gray-400 font-terminal text-sm">arkyv://gred.babachain.zk</span>
                        </div>
                    </div>

                    {/* Loading Steps */}
                    <div
                        ref={terminalRef}
                        className="space-y-2 mb-6 h-64 overflow-y-auto terminal-scroll bg-gray-900 p-4 rounded"
                    >
                        {visibleSteps.length === 0 ? (
                            <div className="text-gray-500 font-terminal text-sm p-2 rounded bg-gray-800 bg-opacity-50">
                                <span className="text-hot-pink mr-2">&gt;</span>
                                <span className="animate-pulse">Waiting for connection...</span>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {terminalLines}
                            </div>
                        )}
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-4">
                        <div className="flex justify-between text-xs font-terminal text-gray-400 mb-2">
                            <span>Progress</span>
                            <span>{Math.floor(progress)}%</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-hot-pink via-purple-400 to-cyan-400 transition-all duration-300 ease-out progress-bar"
                                style={{ width: `${Math.min(progress, 100)}%` }}
                            ></div>
                        </div>
                    </div>

                    {/* Status indicators */}
                    <div className="flex justify-between text-xs font-terminal">
                        <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                            <span className="text-green-400">Oracle Consensus: ACTIVE</span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                            <span className="text-cyan-400">ZK-Rollup: SYNCED</span>
                        </div>
                    </div>

                    {/* Entry Button - shown when loading is complete */}
                    {showEntryButton && (
                        <div className="mt-6 text-center">
                            <button
                                onClick={() => router.push('/arkyv/terminal')}
                                className="px-8 py-3 bg-gradient-to-r from-hot-pink via-cyber-purple to-baby-blue text-black font-terminal font-bold text-lg rounded-lg hover:shadow-lg hover:shadow-hot-pink/50 transition-all duration-300 transform hover:scale-105 animate-pulse"
                            >
                                CONFIRM LOGIN WITH BABACHAIN
                            </button>
                        </div>
                    )}
                </div>

                {/* Bottom info */}
                <div className="text-center mt-8 text-gray-500 font-terminal text-xs">
                    <p>Powered by Babushka AI • Secured by Zero-Knowledge Proofs</p>
                </div>
            </div>

            <style jsx>{`
                .grid-background {
                    background-image: 
                        linear-gradient(rgba(255, 20, 147, 0.1) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255, 20, 147, 0.1) 1px, transparent 1px);
                    background-size: 50px 50px;
                    animation: grid-move 20s linear infinite;
                }

                .glitch-overlay {
                    background: linear-gradient(
                        90deg,
                        transparent 0%,
                        rgba(255, 20, 147, 0.03) 50%,
                        transparent 100%
                    );
                    animation: glitch-sweep 3s ease-in-out infinite;
                }

                .glitch-text {
                    animation: glitch 2s infinite;
                }

                .progress-bar {
                    animation: progress-glow 2s ease-in-out infinite alternate;
                }

                @keyframes grid-move {
                    0% { transform: translate(0, 0); }
                    100% { transform: translate(50px, 50px); }
                }

                @keyframes glitch-sweep {
                    0%, 100% { transform: translateX(-100%); }
                    50% { transform: translateX(100vw); }
                }

                @keyframes glitch {
                    0%, 100% { transform: translateX(0); }
                    10% { transform: translateX(-2px) skew(-1deg); }
                    20% { transform: translateX(2px) skew(1deg); }
                    30% { transform: translateX(-1px) skew(-0.5deg); }
                    40% { transform: translateX(1px) skew(0.5deg); }
                    50% { transform: translateX(0); }
                }

                @keyframes progress-glow {
                    0% { box-shadow: 0 0 5px rgba(255, 20, 147, 0.5); }
                    100% { box-shadow: 0 0 20px rgba(255, 20, 147, 0.8), 0 0 30px rgba(138, 43, 226, 0.6); }
                }
            `}</style>
        </div>
    );
});

export default Loader;
