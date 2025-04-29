import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FaArrowUp } from "react-icons/fa6";
import { IoMdMicOff } from "react-icons/io";
import Blob from './Blob';
import { mirage } from 'ldrs'


mirage.register()
const BACKEND_URL = 'http://localhost:8000';

// Helpers (tokenizeText, cleanWord - remain the same)
const tokenizeText = (text) => {
    if (!text) return [];
    return text.match(/[\w'-]+|[.,!?;:]+|\s+/g) || [];
};
const cleanWord = (word) => {
    if (!word) return '';
    return word.replace(/^[^\w'-]+|[^\w'-]+$/g, '').toLowerCase();
}

export default function ChatBox() {
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [wordsToDisplay, setWordsToDisplay] = useState([]);
    const [error, setError] = useState('');
    const [lastSpokenTokenIndex, setLastSpokenTokenIndex] = useState(-1);
    const [currentlySpeakingTokenIndex, setCurrentlySpeakingTokenIndex] = useState(-1);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [maskEnabled, setMaskEnabled] = useState(false);

    // Refs
    const readerRef = useRef(null);
    const transcriptionContainerRef = useRef(null);
    const wordsToDisplayRef = useRef(wordsToDisplay);
    const lastSpokenTokenIndexRef = useRef(lastSpokenTokenIndex);
    const hasScrolledRef = useRef(false); // Tracks if first USER scroll happened this session
    const listenerAddedRef = useRef(false); // Tracks if the listener was added this session
    const inputRef = useRef(null);

    // Keep standard refs updated (remain the same)
    useEffect(() => { wordsToDisplayRef.current = wordsToDisplay; }, [wordsToDisplay]);
    useEffect(() => { lastSpokenTokenIndexRef.current = lastSpokenTokenIndex; }, [lastSpokenTokenIndex]);

    // --- Focus Input on Mount ---
    useEffect(() => {
        console.log("DEBUG: Component mounted, focusing input.");
        inputRef.current?.focus(); // Optional chaining for safety
    }, [isSpeaking]); // Empty dependency array runs only once on mount

    // --- Helper function to safely focus input ---
    const focusInput = useCallback(() => {
        // Ensure focus only happens if not currently processing
        // Add a small delay to allow state updates to potentially render first
        setTimeout(() => {
             if (!isProcessing && inputRef.current) {
                 console.log("DEBUG: Focusing input field.");
                 inputRef.current.focus();
             } else {
                 console.log("DEBUG: Skipping input focus (still processing or ref missing).");
             }
        }, 50); // 50ms delay
    }, [isProcessing]); // Recreate if isProcessing changes (though check happens inside)

    // --- Reset State ---
    const resetChatState = useCallback(() => {
        console.log("DEBUG: Resetting chat state...");
        setWordsToDisplay([]);
        setError('');
        setIsProcessing(false);
        setLastSpokenTokenIndex(-1);
        setCurrentlySpeakingTokenIndex(-1);
        setIsSpeaking(false);
        setMaskEnabled(false);          // Reset mask state
        hasScrolledRef.current = false; // Reset scroll tracking ref
        listenerAddedRef.current = false; // <-- Reset listener tracking ref

        if (readerRef.current) {
             console.log("DEBUG: Cancelling previous reader on reset.");
             readerRef.current.cancel().catch(e => console.warn("Error cancelling reader:", e));
             readerRef.current = null;
        }
    }, []);

    // --- Send Message / SSE Processing --- (No changes needed)
    const sendMessage = useCallback(async () => {
        if (!input.trim() || isProcessing) return;
        const userQuery = input;
        setInput('');
        resetChatState();
        setIsProcessing(true);
        inputRef.current?.focus(); 
        console.log("DEBUG: sendMessage triggered.");

        // ... SSE Logic remains the same ...
        // It will set isProcessing=true, then isSpeaking=true on first highlight
         try {
            const response = await fetch(`${BACKEND_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
                body: JSON.stringify({ prompt: userQuery }),
            });
            if (!response.ok || !response.body) { throw new Error(`HTTP error! status: ${response.status}`); }

            readerRef.current = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let accumulatedData = '';
            const currentReader = readerRef.current;
            console.log("DEBUG: Stream reading started.");

            while (true) {
                if (readerRef.current !== currentReader) { console.log("DEBUG: Stream stopped due to reader change."); break; }

                let value, done;
                try { ({ value, done } = await currentReader.read()); }
                catch (readError) {
                    if (readError.name === 'AbortError' || readError.message.includes('cancelled')) { console.log("DEBUG: Stream read cancelled."); }
                    else { console.warn("DEBUG: Stream read error:", readError); setError(`Stream Read Error: ${readError.message}`); }
                    break;
                }
                if (done) { console.log("DEBUG: Stream finished (done=true)."); break; }

                accumulatedData += decoder.decode(value, { stream: true });
                let boundary = accumulatedData.indexOf('\n\n');

                while (boundary >= 0) {
                    const message = accumulatedData.substring(0, boundary);
                    accumulatedData = accumulatedData.substring(boundary + 2);
                    let event = 'message', data = '';
                    message.split('\n').forEach(line => {
                        if (line.startsWith('event:')) event = line.substring('event:'.length).trim();
                        else if (line.startsWith('data:')) data = line.substring('data:'.length).trim();
                    });

                    try {
                        if (!data) {
                             boundary = accumulatedData.indexOf('\n\n');
                             continue;
                        }
                        const parsedData = JSON.parse(data);

                        if (event === 'chunk') {
                            const newTokens = tokenizeText(parsedData);
                            if (newTokens.length > 0) {
                                setWordsToDisplay(prevWords => [...prevWords, ...newTokens]);
                            }
                        } else if (event === 'full_text') {
                             console.log("DEBUG: Received full_text event.");
                        } else if (event === 'word_highlight') {
                            const spokenWord = parsedData;
                             // This state change will trigger the new useEffect below
                             if (!isSpeaking) setIsSpeaking(true);

                            if (spokenWord) {
                                const cleanedSpokenWord = cleanWord(spokenWord);
                                if (cleanedSpokenWord) {
                                    let foundIndex = -1;
                                    const currentWords = wordsToDisplayRef.current;
                                    const startIndex = lastSpokenTokenIndexRef.current + 1;

                                    for (let i = startIndex; i < currentWords.length; i++) {
                                        const currentToken = currentWords[i];
                                        if (/\w/.test(currentToken) && cleanWord(currentToken) === cleanedSpokenWord) {
                                            foundIndex = i;
                                            break;
                                        }
                                    }

                                    if (foundIndex !== -1) {
                                        setCurrentlySpeakingTokenIndex(foundIndex);
                                        let finalIndexToHighlight = foundIndex;
                                        while (finalIndexToHighlight + 1 < currentWords.length &&
                                               !/\w/.test(currentWords[finalIndexToHighlight + 1])) {
                                             finalIndexToHighlight++;
                                        }
                                        setLastSpokenTokenIndex(finalIndexToHighlight);
                                    } else {
                                         console.warn(`DEBUG: Spoken word '${cleanedSpokenWord}' not found sequentially after index ${startIndex}.`);
                                    }
                                }
                            } else {
                                console.debug("DEBUG: Received empty word_highlight signal.");
                            }
                        }
                        else if (event === 'stream_end') {
                            console.log("DEBUG: Received stream_end signal.");
                            setIsSpeaking(false); // Will trigger useEffect cleanup if listener exists
                            setCurrentlySpeakingTokenIndex(-1);
                            if (readerRef.current === currentReader) readerRef.current = null;
                            setIsProcessing(false);
                            inputRef.current?.focus(); 
                        } else if (event === 'error') {
                            throw new Error(parsedData);
                        }

                    } catch (e) {
                        console.error("DEBUG: Error processing SSE message:", e, "Raw Data:", data);
                        setError(`Processing Error: ${e.message}`);
                        setIsSpeaking(false);
                        setCurrentlySpeakingTokenIndex(-1);
                        setIsProcessing(false);
                        if (readerRef.current === currentReader) readerRef.current = null;
                        inputRef.current?.focus();
                        break;
                    }
                    boundary = accumulatedData.indexOf('\n\n');
                }
                 if (error) break;
            }

        } catch (err) {
            if (err.name !== 'AbortError' && !err.message.includes('cancelled')) {
                 console.error('DEBUG: Fetch/Stream Error:', err);
                 setError(`Error: ${err.message}`);
            } else { console.log("DEBUG: Fetch/Stream aborted or cancelled."); }
             setIsSpeaking(false);
             setCurrentlySpeakingTokenIndex(-1);
             setIsProcessing(false);
             setLastSpokenTokenIndex(-1);
             inputRef.current?.focus();
             if (readerRef.current) { readerRef.current = null; }
        } finally {
             console.log("DEBUG: sendMessage finally block.");
             if (isProcessing && readerRef.current === null) {
                 console.log("DEBUG: Cleaning up potentially incomplete processing state in finally.");
                 setIsProcessing(false);
                 setIsSpeaking(false);
                 setCurrentlySpeakingTokenIndex(-1);
                 inputRef.current?.focus();
             }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [input, isProcessing, resetChatState]);


    // --- Stop Speech --- (No changes needed)
     // --- Stop Speech ---
     const handleStopSpeech = useCallback(async () => {
        console.log('DEBUG: Stop button clicked.');
        setError('');
        // Set states immediately for UI responsiveness
        setIsProcessing(false);
        setIsSpeaking(false);
        setCurrentlySpeakingTokenIndex(-1);

        // Cancel the reader if it exists
        if (readerRef.current) {
             console.log("DEBUG: Cancelling fetch reader via stop button.");
             const readerToCancel = readerRef.current;
             readerRef.current = null; // Set ref to null *before* cancelling
             try { await readerToCancel.cancel('User stopped'); }
             catch (e) { /* Ignore AbortError - expected */ }
        }
        // Notify backend
        try {
            console.log("DEBUG: Sending /cancel_tts to backend...");
            await fetch(`${BACKEND_URL}/cancel_tts`, { method: 'POST' });
        } catch (error) { console.error('Error sending cancel request:', error); }

        focusInput(); // <<--- Focus input after stopping
    }, [focusInput]); // Added focusInput dependency


    // --- Effect for Auto-Scrolling --- (No changes needed)
    useEffect(() => {
        // ... auto-scrolling logic remains the same ...
        const indexToScrollTo = currentlySpeakingTokenIndex !== -1 ? currentlySpeakingTokenIndex : lastSpokenTokenIndex;

        if (indexToScrollTo >= 0 && transcriptionContainerRef.current) {
            const container = transcriptionContainerRef.current;
            let targetIndex = indexToScrollTo;
            if (currentlySpeakingTokenIndex !== -1) {
                targetIndex = currentlySpeakingTokenIndex;
            } else {
                let tempIndex = lastSpokenTokenIndex;
                 const currentWords = wordsToDisplayRef.current;
                if (currentWords && tempIndex >= 0 && tempIndex < currentWords.length) {
                     while (tempIndex >= 0 && !/\w/.test(currentWords[tempIndex])) { tempIndex--; }
                     if (tempIndex >= 0) targetIndex = tempIndex;
                }
            }
            const targetSpan = container.querySelector(`span[data-index="${targetIndex}"]`);
            if (targetSpan) {
                targetSpan.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
        }
    }, [currentlySpeakingTokenIndex, lastSpokenTokenIndex]);

    // --- NEW Effect to ADD the FIRST scroll listener AFTER speech starts ---
    useEffect(() => {
        const container = transcriptionContainerRef.current;
        let listenerActive = false; // Track if listener was added in *this* effect run

        const handleFirstScroll = () => {
            // Check hasScrolledRef - this prevents mask if user scrolled *before* speech started
            if (!hasScrolledRef.current) {
                console.log("*** FIRST USER SCROLL DETECTED! Enabling mask. ***");
                setMaskEnabled(true); // Enable the mask
                hasScrolledRef.current = true; // Mark that *a* scroll has happened

                // Clean up this specific listener instance
                if (container && listenerActive) { // Check listenerActive flag
                     container.removeEventListener('scroll', handleFirstScroll);
                     listenerAddedRef.current = false; // Allow re-adding if needed later
                     listenerActive = false;
                     console.log("DEBUG: First scroll listener removed.");
                }
            }
        };

        // Condition to add listener:
        // 1. Component is processing/speaking
        // 2. Speech has actually started (isSpeaking is true)
        // 3. Listener hasn't already been added for this response (listenerAddedRef is false)
        // 4. Container exists
        if (isProcessing && isSpeaking && !listenerAddedRef.current && container) {
            console.log("DEBUG: Adding first scroll listener (triggered by isSpeaking=true).");
            container.addEventListener('scroll', handleFirstScroll, { passive: true });
            listenerAddedRef.current = true; // Mark listener as added for this response cycle
            listenerActive = true; // Mark listener as added *in this effect run*
        }

        // Cleanup function: Remove listener if component unmounts, or if isProcessing/isSpeaking becomes false
        // BEFORE the first scroll happened for this response cycle.
        return () => {
            if (container && listenerActive) { // Only remove if added in this run
                console.log("DEBUG: Cleaning up first scroll listener (due to effect deps change/unmount).");
                container.removeEventListener('scroll', handleFirstScroll);
                // Don't reset listenerAddedRef here, reset happens in resetChatState
            }
        };
    }, [isProcessing, isSpeaking]); // Dependencies: run when processing/speaking state changes


    // --- Render ---
    return (
        <div className="flex flex-col bg-[#1a1a1a] h-screen items-center justify-between p-4">
            {/* Transcription Display Area */}
            <div className='h-full min-w-4xl max-w-4xl relative  mb-4 flex items-center justify-center'>
                <Blob />
                <div
                    ref={transcriptionContainerRef}
                    className=" text-left min-w-xl max-w-xl  rounded-md flex flex-wrap justify-start text-lg leading-relaxed overflow-y-auto scrollbar-hide"
                    style={{
                        height: '4rem', // Keep fixed height
                        // Conditionally apply mask styles based on maskEnabled state
                        ...(maskEnabled && {
                            maskImage: 'linear-gradient(to bottom, transparent 0%, transparent 5%, transparent 10%, black 100%)',
                            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, transparent 5%, transparent 10%, black 100%)',
                        })
                    }}
                >
                    {/* Placeholders and Error */}
                    {error && <p className="text-red-400 mb-4 font-medium w-full">Error: {error}</p>}
                    {!isProcessing && wordsToDisplay.length === 0 && !error && (
                        <p className="text-gray-500 text-center italic w-full pl-1">Assistant response...</p>
                    )}
                    {isProcessing && wordsToDisplay.length === 0 && !error && (
                        <p className="text-gray-400 text-center animate-pulse w-full pl-1"><l-mirage
                        size="55"
                        speed="2.5" 
                        color="rgb(80,150,255)" 
                      ></l-mirage></p>
                    )}

                    {/* Word Rendering */}
                    {wordsToDisplay.map((token, index) => {
                        const baseClass = `inline-block mx-[1px] transition-all duration-150 ease-in-out`;
                        let displayClass = '';

                        if (index === currentlySpeakingTokenIndex) {
                            displayClass = `text-[rgb(80_150_255)] opacity-100`;
                        } else if (index <= lastSpokenTokenIndex) {
                            displayClass = `text-white opacity-100`;
                        } else {
                            displayClass = `text-white opacity-15`;
                        }

                        return (
                            <span
                                key={index}
                                data-index={index}
                                className={`${baseClass} ${displayClass}`}
                            >
                                {token}
                            </span>
                        );
                    })}
                    <div className="h-1 w-full"></div>
                </div>
            </div>

            {/* Input Area */}
            <div className="p-3 bg-[#222]/90 backdrop-blur-md border border-white/20 w-full max-w-4xl rounded-xl shadow-lg shadow-black/30 sticky bottom-4">
                 {/* Input elements remain the same */}
                 <div className="flex items-center gap-3">
                    <input
                        type="text"
                        ref={inputRef}
                        className="flex-1 p-2 border-0 bg-transparent text-white placeholder-gray-400 focus:outline-none focus:ring-0 rounded-md"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !isProcessing && sendMessage()}
                        placeholder={isProcessing ? "Assistant speaking..." : "Type your message..."}
                        disabled={isProcessing}
                    />
                    <button
                        onClick={sendMessage}
                        title="Send Message"
                        className={`p-2.5 ${isProcessing || !input.trim() ? 'bg-gray-600 cursor-not-allowed' : 'user-button bg-blue-600 hover:bg-blue-500 hover:scale-[1.03]'} text-white border border-white/20 rounded-full transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 disabled:opacity-60`}
                        disabled={isProcessing || !input.trim()}
                    > <FaArrowUp /> </button>
                    <button
                        title="Stop Current Speech"
                        onClick={handleStopSpeech}
                        disabled={!isProcessing}
                        className={`p-2.5 ${!isProcessing ? 'bg-red-800 opacity-50 cursor-not-allowed' : 'bg-red-600 hover:bg-red-500 hover:scale-[1.03]'} text-white rounded-full transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-red-500 disabled:hover:bg-red-800`}
                    > <IoMdMicOff /> </button>
                </div>
            </div>
        </div>
    );
}