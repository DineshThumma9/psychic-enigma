import type Session from "../entities/Session.ts";
import sessionStore from "../store/sessionStore.ts";
import {useEffect, useRef} from "react";
import {
    deleteSession,
    getAllSessions,
    getChatHistory,
    newSession,
    streamChatResponse,
    testMsg,
    updateSessionTitle
} from "../api/session-api.ts";
import type Message from "../entities/Message.ts";
import {uuidv4, z} from "zod/v4";
import {v4} from "uuid";
import useAuthStore from "../store/authStore.ts";
import useSessionStore from "../store/sessionStore.ts";


const useSessions = () => {
    const eventSourceRef = useRef<EventSource | null>(null);

    // Get store functions and state
    const store = sessionStore.getState();
    const {
        addMessage, setSessions, removeSession, addSession, clear,
        setCurrentSessionId, current_session, setTitle,
        setMessages, setStreaming, updateMessage, isStreaming, setLoading,
    } = store;

    useEffect(() => {
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                console.log("EventSource closed on unmount.");
            }
        };
    }, []);


    const tstMsgFunc = async (msg: string) => {
        try {
            addMessage(await testMsg(msg));
        } catch (error) {
            console.error("Error in tstMsgFunc:", error);
        }
    };


    const createNewSession = async () => {
        try {
            setLoading(true);
            const session = await newSession();

            addSession(session);
            setCurrentSessionId(session.session_id);
            setTitle("New SessionComponent");
            clear();

            console.log("New session created and set as current:", session.session_id);
            return session.session_id;
        } catch (e) {
            console.error("Error in createNewSession:", e);
            throw e;
        } finally {
            setLoading(false);
        }
    };


    const streamMessage = async (userMsg: string, sessionId: string) => {


        const token = useAuthStore.getState().accessToken;


        const assistantMsgId = v4();
        addMessage({
            message_id: assistantMsgId,
            session_id: sessionId,
            content: "",
            sender: "assistant",
            timestamp: new Date().toISOString(),
        });

        setStreaming(true);

        try {
            const session_id = useSessionStore.getState().current_session;
            const token = useAuthStore.getState().accessToken;
            const msg = userMsg

            if (!session_id) throw new Error("Missing session ID");

            const res = await fetch("http://localhost:8000/sessions/simple-stream", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token && {Authorization: `Bearer ${token}`})
                },
                body: JSON.stringify({session_id, msg})
            });

            if (!res.ok) {
                const errorText = await res.text();
                console.error("Backend error:", res.status, errorText);
                throw new Error("Stream failed");
            }

            if (!res.body) {
                throw new Error("Response body is null");
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");

            let fullText = "";

            while (true) {
                const {value, done} = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, {stream: true});
                const tokens = chunk
                    .split("data: ")
                    .filter(Boolean)
                    .map((t) => t.trim());

                for (const token of tokens) {
                    fullText += token;
                    updateMessage(assistantMsgId, {content: fullText});
                }
            }
        } catch (err) {
            updateMessage(assistantMsgId, {
                content: "[Error streaming response]",
            });
            console.error(err);
        } finally {
            setStreaming(false);
        }
    };




    const changeTitle = async (sessionId: string, title: string) => {
        try {
            setLoading(true);
            if (!current_session) throw new Error("No active session.");

            const newTitle = await updateSessionTitle(sessionId, title);
            setTitle(newTitle);

            // Update the session in the sessions list reactively
            const currentState = sessionStore.getState();
            const updatedSessions = currentState.sessions.map(session =>
                (session.session_id || session.session_id) === current_session
                    ? {...session, title: newTitle, updated_at: new Date().toISOString()}
                    : session
            );
            setSessions(updatedSessions);

            console.log("Title updated:", newTitle);
        } catch (e) {
            console.error("Error updating title", e);
            throw e;
        } finally {
            setLoading(false);
        }
    };

    const getHistory = async (session_id: string) => {
        try {
            setLoading(true);
            const history = await getChatHistory({session_id});
            setCurrentSessionId(session_id);
            setMessages(history);

            const currentState = sessionStore.getState();
            const session = currentState.sessions.find(s => (s.session_id || s.session_id) === session_id);
            if (session) {
                setTitle(session.title);
            }

            console.log("History loaded for session:", session_id);
        } catch (e) {
            console.error("Error fetching history", e);
            throw e;
        } finally {
            setLoading(false);
        }
    };

    const deleteSessionById = async (session_id: string) => {
        try {
            setLoading(true);
            await deleteSession(session_id);
            removeSession(session_id);


            if (current_session === session_id) {
                const remainingSessions = sessionStore.getState().sessions;
                if (remainingSessions.length > 0) {
                    const latestSession = remainingSessions.sort((a, b) =>

                        new Date(a.updated_at || a.created_at).getTime() -
                        new Date(b.updated_at || b.created_at).getTime()
                    )[0];
                    await getHistory(latestSession.session_id || latestSession.session_id!);
                } else {

                    setCurrentSessionId(null);
                    clear();
                    setTitle("");
                }
            }

            console.log("Session deleted:", session_id);
        } catch (e) {
            console.error("Error deleting session", e);
            throw e;
        } finally {
            setLoading(false);
        }
    };

    const getSessions = async () => {
        try {
            setLoading(true);
            type Session = z.infer<typeof Session>;
            const allSessions: Session[] = await getAllSessions();
            setSessions(allSessions);

            const currentState = sessionStore.getState();
            if (!currentState.current_session && allSessions.length > 0) {
                const latestSession = allSessions.sort((a, b) =>
                    new Date(b.updated_at || b.created_at).getTime() -
                    new Date(a.updated_at || a.created_at).getTime()
                )[0];
                await getHistory(latestSession.session_id || latestSession.session_id);
            }

            console.log("Sessions loaded:", allSessions.length);
        } catch (e) {
            console.error("Error fetching all sessions", e);
            setSessions([]);
        } finally {
            setLoading(false);
        }
    };

    const selectSession = async (session_id: string) => {
        try {
            if (current_session === session_id) {
                console.log("Session already selected:", session_id);
                return;
            }


            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
                setStreaming(false);
            }

            await getHistory(session_id);
            console.log("Session selected:", session_id);
        } catch (e) {
            console.error("Error selecting session", e);
            throw e;
        }
    };

    const fetchAllSessions = getSessions;

    return {
        createNewSession,
        changeTitle,
        getHistory,
        deleteSessionById,
        getSessions,
        fetchAllSessions,
        streamMessage,
        tstMsgFunc,
        selectSession
    };
};

export default useSessions;
