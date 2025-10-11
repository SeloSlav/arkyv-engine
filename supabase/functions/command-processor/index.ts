/**
 * Command Processor Edge Function for Supabase
 * 
 * Entry point for handling and processing game/world commands via Supabase Edge Functions.
 * 
 * IMPORTANT: If this file appears red or you see TypeScript warnings in your editor, 
 * don't worry! It will work when copy and pasted into the Supabase Edge Functions dashboard.
 * 
 * - Accepts POST requests with a JSON body containing a "command" property for direct execution,
 *   or runs in orchestrated mode for normal processing.
 * - Utilizes Supabase client for DB access and integrates with AI providers via aiProvider.ts.
 * 
 * Environment Variables:
 * - SUPABASE_URL / EDGE_SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY / EDGE_SERVICE_ROLE_KEY: Service role secret (required)
 * - AI_PROVIDER: Provider ("openai" [default] or "grok")
 * - OPENAI_API_KEY / GROK_API_KEY: AI API keys for chosen provider
 */


import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.33.1";
import { createChatCompletion, getModel } from "./aiProvider.ts";

// Set a timeout for the entire function execution to prevent infinite hangs
const FUNCTION_TIMEOUT = 8000; // 8 seconds

// Environment variables with fallback logic
const supabaseUrl = Deno.env.get("EDGE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("EDGE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";

serve(async (req) => {
    
  try {
    console.log("Command processor starting...");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check if this is a direct command request
    let requestBody = null;
    try {
      requestBody = await req.json();
    } catch (e) {
      // No JSON body, continue with normal processing
    }

    if (requestBody && requestBody.command) {
      // Handle direct command
      console.log("Processing direct command:", requestBody.command);
      return await executeDirectCommand(supabase, requestBody.command);
    } else {
      // Execute the main command processing logic
      return await executeCommandProcessor(supabase);
    }

  } catch (error) {
    console.error("Command processor error:", error);
    return new Response(`error: ${error.message}`, { status: 500 });
  }
});

// Direct command processing for immediate execution
async function executeDirectCommand(supabase, commandData) {
  try {
    console.log("Processing direct command:", commandData);
    
    // Get OpenAI key
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      throw new Error("OpenAI API key not found");
    }
    
    // Create a mock command object that matches the expected format
    const mockCommand = {
      id: Date.now(), // Temporary ID
      raw: commandData.raw,
      character_id: commandData.character_id,
      room_id: commandData.room_id,
      conversation_history: []
    };
    
    // Process the command directly using the same logic as the main processor
    if (commandData.raw === "__GREET") {
      console.log(`🎉 Direct __GREET command received for room ${commandData.room_id}`);
      try {
        await handleNPCGreetings(commandData.room_id, commandData.character_id, "Profile", supabase, openaiKey);
        console.log(`✅ Direct __GREET processing complete`);
      } catch (greetError) {
        console.error(`❌ Error processing direct __GREET:`, greetError);
        throw greetError;
      }
    } else {
      throw new Error(`Unknown direct command: ${commandData.raw}`);
    }
    
    console.log("Direct command processed successfully");
    return new Response("processed");
  } catch (error) {
    console.error("Direct command processing error:", error);
    return new Response(`error: ${error.message}`, { status: 500 });
  }
}

// Main command processing logic
async function executeCommandProcessor(supabase) {
  try {
    const { data: cmds, error: cmdError} = await supabase
      .from("commands")
      .select("id, raw, character_id, room_id, conversation_history, user_id")
      .is("processed_at", null)
      .order("created_at", { ascending: true })
      .limit(5); // Reduced from 25 to prevent timeouts

    if (cmdError) {
      console.error("Error fetching commands:", cmdError);
      return new Response("error fetching commands", { status: 500 });
    }

    if (!cmds?.length) {
      console.log("No commands to process");
      return new Response("ok");
    }

    console.log(`Processing ${cmds.length} commands`);

    for (const cmd of cmds) {
      try {
        console.log(`Processing command: ${cmd.raw} for character ${cmd.character_id} in room ${cmd.room_id}`);

        // Resolve actor (character or profile) and name
        let actorName = 'unknown';
        let actorId = cmd.character_id;
        let isProfile = false;
        
        try {
          if (cmd.character_id) {
            // Character mode
            const { data: charRow } = await supabase
              .from("characters")
              .select("name")
              .eq("id", cmd.character_id)
              .maybeSingle();
            if (charRow?.name) {
              actorName = charRow.name;
            }
          } else if (cmd.user_id) {
            // Profile mode - lookup by user_id
            const { data: profileRow } = await supabase
              .from("profiles")
              .select("id, handle")
              .eq("user_id", cmd.user_id)
              .maybeSingle();
            if (profileRow) {
              actorName = profileRow.handle || 'You';
              actorId = profileRow.id;
              isProfile = true;
            }
          }
        } catch (err) {
          console.error("Error resolving actor:", err);
        }
        
        const characterName = actorName;
        console.log(`Character name: ${characterName}, isProfile: ${isProfile}, actorId: ${actorId}`);

        const raw = cmd.raw.trim();

          if (raw === "help") {
            const helpMessage = `[AVAILABLE COMMANDS]

                • say <message> - Speak to everyone in the room
                • whisper <username> <message> - Send a private message to someone in the room
                • look - Examine your current location and see who's present
                • talk <npc> <message> - Speak to an NPC (use 'who' to see available NPCs)
                • who - See who else is in the room with you
                • set handle <name> - Set your display name (profile mode only)
                • <direction> - Move to another location (north, south, east, west, etc.)

                [EXAMPLES]
                • say Hello everyone!
                • whisper Alice I have a secret to tell you
                • talk guard Who goes there?
                • set handle Wanderer
                • look
                • who
                • north`;

            const { error } = await supabase.from("room_messages").insert({
              room_id: cmd.room_id,
              kind: "system",
              body: helpMessage
            });

            if (error) {
              console.error("Error inserting help message:", error);
            } else {
              console.log("Help message inserted successfully");
            }

          } else if (raw.startsWith("set handle ")) {
            const newHandle = raw.slice(11).trim();
            
            if (!newHandle) {
              const { error } = await supabase.from("room_messages").insert({
                room_id: cmd.room_id,
                kind: "error",
                body: "Usage: set handle <name>\nExample: set handle Wanderer"
              });
              if (error) console.error("Error inserting set handle usage:", error);
            } else if (!isProfile) {
              const { error } = await supabase.from("room_messages").insert({
                room_id: cmd.room_id,
                kind: "error",
                body: "The 'set handle' command is only available in profile mode. Characters already have names."
              });
              if (error) console.error("Error inserting profile-only message:", error);
            } else if (newHandle.length > 30) {
              const { error } = await supabase.from("room_messages").insert({
                room_id: cmd.room_id,
                kind: "error",
                body: "Handle must be 30 characters or less."
              });
              if (error) console.error("Error inserting handle length error:", error);
            } else {
              // Update the profile's handle
              const { error: updateError } = await supabase
                .from("profiles")
                .update({ handle: newHandle })
                .eq("id", actorId);
              
              if (updateError) {
                console.error("Error updating handle:", updateError);
                const { error } = await supabase.from("room_messages").insert({
                  room_id: cmd.room_id,
                  kind: "error",
                  body: "Failed to update handle. Please try again."
                });
                if (error) console.error("Error inserting update failure message:", error);
              } else {
                console.log(`Handle updated to: ${newHandle}`);
                const { error } = await supabase.from("room_messages").insert({
                  room_id: cmd.room_id,
                  kind: "system",
                  body: `Your handle has been set to: ${newHandle}`
                });
                if (error) console.error("Error inserting success message:", error);
                
                // Update actorName for this session
                actorName = newHandle;
              }
            }

          } else if (raw.startsWith("say ")) {
            const body = raw.slice(4).trim();
            if (!body) {
              console.log("Say command received with empty message; aborting insert.");
            } else if (isProfile && (!actorName || actorName === 'You')) {
              // Profile mode without a handle - warn the user
              const { error } = await supabase.from("room_messages").insert({
                room_id: cmd.room_id,
                kind: "error",
                body: "Please set your handle before sending messages. Use: set handle <name>"
              });
              if (error) console.error("Error inserting handle warning:", error);
            } else {
              const normalizeRegionValue = (value) => {
                if (typeof value !== "string") {
                  return null;
                }
                const trimmed = value.trim();
                return trimmed.length ? trimmed : null;
              };

              let resolvedRegionName = null;
              let resolvedRegionLabel = null;

              try {
                const { data: roomRegion, error: roomRegionError } = await supabase
                  .from("rooms")
                  .select("region_name, region")
                  .eq("id", cmd.room_id)
                  .single();

                if (roomRegionError) {
                  console.error("Error fetching room region for say command:", roomRegionError);
                } else if (roomRegion) {
                  resolvedRegionName = normalizeRegionValue(roomRegion.region_name) || normalizeRegionValue(roomRegion.region);
                  resolvedRegionLabel = normalizeRegionValue(roomRegion.region) || resolvedRegionName;
                }
              } catch (regionFetchError) {
                console.error("Failed to resolve room region for say command:", regionFetchError);
              }

              console.log(`Inserting say message: ${characterName}: ${body}`, {
                resolvedRegionName,
                resolvedRegionLabel
              });

              const messagePayload = {
                room_id: cmd.room_id,
                character_id: cmd.character_id,
                character_name: characterName,
                kind: "say",
                body,
                ...(resolvedRegionLabel ? { region: resolvedRegionLabel } : {}),
                ...(resolvedRegionName ? { region_name: resolvedRegionName } : {})
              };

              const { data: insertedMessage, error } = await supabase
                .from("room_messages")
                .insert(messagePayload)
                .select("id, created_at, region, region_name")
                .single();

              if (error) {
                console.error("Error inserting say message:", error);
              } else {
                console.log("Say message inserted successfully", insertedMessage?.id);

                if (resolvedRegionName) {
                  const regionChatPayload = {
                    region: resolvedRegionLabel || resolvedRegionName,
                    region_name: resolvedRegionName,
                    room_id: cmd.room_id,
                    character_id: cmd.character_id,
                    character_name: characterName,
                    kind: "say",
                    body,
                    ...(insertedMessage?.created_at ? { created_at: insertedMessage.created_at } : {})
                  };

                  const { error: regionChatError } = await supabase
                    .from("region_chats")
                    .insert(regionChatPayload);

                  if (regionChatError) {
                    console.error("Error inserting region chat message:", regionChatError);
                  } else {
                    console.log("Region chat message inserted successfully");
                  }
                }
              }
            }

          } else if (raw === "look") {
            // Get room details with region display name and image
            const { data: room, error: roomError } = await supabase
              .from("rooms")
              .select("name, description, region_name, image_url, regions!rooms_region_name_fkey(display_name)")
              .eq("id", cmd.room_id)
              .single();

            if (roomError) {
              console.error("Error fetching room:", roomError);
            } else if (room) {
              const regionDisplayName = room.regions?.display_name || room.region_name;
              const roomHeading = regionDisplayName
                ? `${room.name.toUpperCase()} (${regionDisplayName.toUpperCase()})`
                : room.name.toUpperCase();

              // Include image marker if room has an image
              let description = room.image_url 
                ? `[IMAGE:${room.image_url}]\n[LOCATION:${roomHeading}]\n${room.description}`
                : `[LOCATION:${roomHeading}]\n${room.description}`;

              // Get other characters in the room (excluding current character)
              let otherCharsQuery = supabase
                .from("characters")
                .select("name")
                .eq("current_room", cmd.room_id);
              
              if (!isProfile && cmd.character_id) {
                otherCharsQuery = otherCharsQuery.neq("id", cmd.character_id);
              }
              const charsResult = await otherCharsQuery;
              const otherChars = charsResult.data || [];

              // Also list profiles present (out-of-character users)
              let otherProfilesQuery = supabase
                .from("profiles")
                .select("handle")
                .eq("current_room", cmd.room_id);
              
              if (isProfile && actorId) {
                otherProfilesQuery = otherProfilesQuery.neq("id", actorId);
              }
              const profilesResult = await otherProfilesQuery;
              const otherProfiles = profilesResult.data || [];

              // Get NPCs in the room
              const { data: npcs } = await supabase
                .from("npcs")
                .select("name, alias, description")
                .eq("current_room", cmd.room_id);

              // Add characters to description
              if ((otherChars && otherChars.length > 0) || (otherProfiles && otherProfiles.length > 0)) {
                const charNames = (otherChars || []).map(c => `• ${c.name}`);
                const profileNames = (otherProfiles || []).map(p => `• ${p.handle}`);
                const combined = [...charNames, ...profileNames].join("\n");
                description += `\n\n[CHARACTERS]\n${combined}`;
              }

              // Add NPCs to description
              if (npcs && npcs.length > 0) {
                const npcList = npcs.map(npc => `• ${npc.name} [${npc.alias}] - ${npc.description || ''}`).join("\n");
                description += `\n\n[NPCs]\n${npcList}`;
              }

              // Add exits to description
              const { data: exits } = await supabase
                .from("exits")
                .select("verb, to_room, rooms!exits_to_room_fkey(name)")
                .eq("from_room", cmd.room_id);

              if (exits && exits.length > 0) {
                const exitList = exits.map(exit => {
                  const roomName = exit.rooms?.name || 'unknown destination';
                  return `• ${exit.verb} → ${roomName}`;
                }).join("\n");
                description += `\n\n[EXITS]\n${exitList}`;
              }

              console.log(`Inserting enhanced room description: ${description}`);
              const { error } = await supabase.from("room_messages").insert({
                room_id: cmd.room_id,
                kind: "system",
                body: description
              });
              if (error) {
                console.error("Error inserting room description:", error);
              } else {
                console.log("Enhanced room description inserted successfully");
              }
            }

          } else if (raw.startsWith("talk ")) {
            const parts = raw.slice(5).trim().split(' ');
            const npcName = parts[0];
            const playerMessage = parts.slice(1).join(' ') || "hello";

            console.log(`Attempting to talk to NPC: ${npcName} with message: ${playerMessage}`);

            // Verify the actor is actually in the room they claim to be in
            let actualRoomId = cmd.room_id;
            if (isProfile && actorId) {
              const { data: prof, error: profError } = await supabase
                .from("profiles")
                .select("current_room")
                .eq("id", actorId)
                .single();
              
              if (profError || !prof) {
                console.error("Error fetching profile room:", profError);
                return;
              }
              actualRoomId = prof.current_room;
            } else if (cmd.character_id) {
              const { data: character, error: charError } = await supabase
                .from("characters")
                .select("current_room")
                .eq("id", cmd.character_id)
                .single();

              if (charError || !character) {
                console.error("Error fetching character room:", charError);
                return;
              }
              actualRoomId = character.current_room;
            }

            console.log(`Actor actual room: ${actualRoomId}, command room: ${cmd.room_id}`);

            // Find the NPC in the character's actual current room by alias
            const { data: npc, error: npcError } = await supabase
              .from("npcs")
              .select("name, alias, dialogue_tree, description")
              .eq("current_room", actualRoomId)
              .eq("alias", npcName.toLowerCase())
              .single();

            if (npcError || !npc) {
              console.log(`NPC ${npcName} not found in room`);
              const { error } = await supabase.from("room_messages").insert({
                room_id: actualRoomId,
                kind: "system",
                body: `There is no one named "${npcName}" here to talk to. Use 'who' to see who's present.`
              });
              if (error) console.error("Error inserting NPC not found message:", error);
            } else {
              // Use just the NPC name without the alias for display
              const npcDisplayName = npc.name;
              // Show immediate typing indicator
              const { data: typingData, error: typingError } = await supabase.from("room_messages").insert({
                room_id: actualRoomId,
                kind: "npc_typing",
                body: `${npcDisplayName} is thinking...`
              }).select('id').single();

              if (typingError) console.error("Error inserting typing indicator:", typingError);

              try {
                // Generate AI response using personality prompt and conversation history
                const personalityPrompt = npc.dialogue_tree?.personality || `You are ${npc.name}. ${npc.description || 'You are a character in this location.'}`;

                // Build messages array with conversation history
                const messages = [
                  {
                    role: 'system',
                    content: `${personalityPrompt}

                    INSTRUCTIONS: Stay in character and respond naturally to what the player says. Remember the conversation context and refer back to previous topics when relevant. Your personality and speaking style should come from your character description above - follow those traits closely.`
                  }
                ];

                // Add conversation history if available
                const conversationHistory = cmd.conversation_history || [];

                if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
                  messages.push(...conversationHistory);
                }

                // Add the current message
                messages.push({
                  role: 'user',
                  content: playerMessage
                });

                const aiData = await createChatCompletion({
                  messages: messages,
                  modelType: 'fast',
                  maxTokens: 500,
                  temperature: 0.8
                });
                
                const aiResponse = aiData?.choices?.[0]?.message?.content || `${npc.name} nods but doesn't respond.`;

                console.log(`NPC ${npc.name} AI response: ${aiResponse}`);

                // Remove typing indicator and insert actual response
                if (typingData?.id) {
                  await supabase.from("room_messages").delete().eq("id", typingData.id);
                }

                const { error } = await supabase.from("room_messages").insert({
                  room_id: actualRoomId,
                  kind: "npc_speech",
                  body: `${npcDisplayName}: ${aiResponse}`
                });

                if (error) {
                  console.error("Error inserting NPC dialogue:", error);
                } else {
                  console.log("AI NPC dialogue inserted successfully");
                }

              } catch (aiError) {
                console.error("Error generating AI response:", aiError);

                // Remove typing indicator
                if (typingData?.id) {
                  await supabase.from("room_messages").delete().eq("id", typingData.id);
                }

                // Fallback to simple response
                const { error } = await supabase.from("room_messages").insert({
                  room_id: actualRoomId,
                  kind: "npc_speech",
                  body: `${npcDisplayName}: *seems distracted and doesn't respond clearly*`
                });
                if (error) console.error("Error inserting fallback response:", error);
              }
            }

          } else if (raw.startsWith("pet ")) {
            const targetName = raw.slice(4).trim().toLowerCase();
            
            console.log(`Processing pet command for: ${targetName}`);

            // Verify the actor is actually in the room they claim to be in
            let actualRoomId = cmd.room_id;
            if (isProfile && actorId) {
              const { data: prof, error: profError } = await supabase
                .from("profiles")
                .select("current_room")
                .eq("id", actorId)
                .single();
              
              if (profError || !prof) {
                console.error("Error fetching profile room:", profError);
                return;
              }
              actualRoomId = prof.current_room;
            } else if (cmd.character_id) {
              const { data: character, error: charError } = await supabase
                .from("characters")
                .select("current_room")
                .eq("id", cmd.character_id)
                .single();

              if (charError || !character) {
                console.error("Error fetching character room:", charError);
                return;
              }
              actualRoomId = character.current_room;
            }

            // Check if target is an NPC first
            const { data: npc, error: npcError } = await supabase
              .from("npcs")
              .select("name, alias, dialogue_tree, description")
              .eq("current_room", actualRoomId)
              .or(`alias.eq.${targetName},name.ilike.%${targetName}%`)
              .single();

            if (npc && !npcError) {
              // Found an NPC
              try {
                // Generate AI reaction
                const aiData = await createChatCompletion({
                  messages: [
                    {
                      role: 'system',
                      content: `You are generating short, 2-3 word reactions for NPCs being petted in a text adventure game. The reactions should be brief, personality-driven, and match the NPC's character. Consider their personality traits, faction, and description when crafting the response.`
                    },
                    {
                      role: 'user',
                      content: `NPC Name: ${npc.name}
Personality: ${npc.dialogue_tree?.personality || 'Unknown'}
Description: ${npc.description || 'No description available'}

Generate a short 2-3 word reaction when this NPC is petted. Examples:
- "purrs softly" (for friendly NPCs)
- "stiffens up" (for formal NPCs)
- "shivers slightly" (for nervous NPCs)
- "leans in" (for affectionate NPCs)
- "steps back" (for defensive NPCs)
- "grins widely" (for cheerful NPCs)

Only respond with the reaction, nothing else.`
                    }
                  ],
                  modelType: 'fast',
                  maxTokens: 10,
                  temperature: 0.8
                });

                const reaction = aiData?.choices?.[0]?.message?.content?.trim() || "looks surprised";

                const { error } = await supabase.from("room_messages").insert({
                  room_id: actualRoomId,
                  kind: "npc_speech",
                  body: `${npc.name} ${reaction} when petted.`
                });
                if (error) console.error("Error inserting pet reaction:", error);

              } catch (aiError) {
                console.error("Error generating AI pet reaction:", aiError);
                const { error } = await supabase.from("room_messages").insert({
                  room_id: actualRoomId,
                  kind: "npc_speech",
                  body: `${npc.name} looks surprised when petted.`
                });
                if (error) console.error("Error inserting fallback pet reaction:", error);
              }
            } else {
              // NPC not found, check if target is a character in the room
            const { data: characters, error: charError } = await supabase
              .from("characters")
              .select("name, description")
              .eq("current_room", actualRoomId)
              .ilike("name", `%${targetName}%`);

            if (charError || !characters || characters.length === 0) {
              const { error } = await supabase.from("room_messages").insert({
                room_id: actualRoomId,
                kind: "system",
                body: `There is no one named "${targetName}" here to pet. Use 'who' to see who's present.`
              });
              if (error) console.error("Error inserting pet not found message:", error);
            } else {

            const targetChar = characters[0];
            
            try {
              // Generate AI reaction for character
              const aiData = await createChatCompletion({
                messages: [
                  {
                    role: 'system',
                    content: `You are generating short, 2-3 word reactions for player characters being petted in a text adventure game. The reactions should be brief, varied, and reflect how a person might react to being petted unexpectedly.`
                  },
                  {
                    role: 'user',
                    content: `Character Name: ${targetChar.name}
Description: ${targetChar.description || 'No description available'}

Generate a short 2-3 word reaction when this character is petted. Examples:
- "looks surprised"
- "smiles warmly"
- "raises eyebrow"
- "chuckles softly"
- "blinks slowly"
- "nods appreciatively"

Only respond with the reaction, nothing else.`
                  }
                ],
                modelType: 'fast',
                maxTokens: 10,
                temperature: 0.8
              });

              const reaction = aiData?.choices?.[0]?.message?.content?.trim() || "looks surprised";

              const { error } = await supabase.from("room_messages").insert({
                room_id: actualRoomId,
                kind: "system",
                body: `${targetChar.name} ${reaction} when petted.`
              });
              if (error) console.error("Error inserting character pet reaction:", error);

            } catch (aiError) {
              console.error("Error generating AI character pet reaction:", aiError);
              const { error } = await supabase.from("room_messages").insert({
                room_id: actualRoomId,
                kind: "system",
                body: `${targetChar.name} looks surprised when petted.`
              });
              if (error) console.error("Error inserting fallback character pet reaction:", error);
            }
            }
            }

          } else if (raw.startsWith("whisper ")) {
            const parts = raw.slice(8).trim().split(' ');
            if (parts.length < 2) {
              const { error } = await supabase.from("room_messages").insert({
                room_id: cmd.room_id,
                kind: "system",
                body: 'Usage: whisper <username> <message>'
              });
              if (error) console.error("Error inserting whisper usage message:", error);
              return;
            }

            const targetUsername = parts[0];
            const whisperMessage = parts.slice(1).join(' ');

            console.log(`Attempting to whisper to: ${targetUsername} with message: ${whisperMessage}`);

            // First, verify the character is actually in the room they claim to be in
            const { data: character, error: charError } = await supabase
              .from("characters")
              .select("current_room")
              .eq("id", cmd.character_id)
              .single();

            if (charError || !character) {
              console.error("Error fetching character room:", charError);
              return;
            }

            // Use the character's actual current room
            const currentRoomId = character.current_room;

            // Find the target character in the same room by name
            const { data: targetChar, error: targetError } = await supabase
              .from("characters")
              .select("id, name")
              .eq("current_room", currentRoomId)
              .eq("name", targetUsername)
              .neq("id", cmd.character_id) // Exclude the sender
              .single();

            if (targetError || !targetChar) {
              console.log(`Target character ${targetUsername} not found in room or is the sender`);
              const { error } = await supabase.from("room_messages").insert({
                room_id: currentRoomId,
                kind: "system",
                body: `There is no one named "${targetUsername}" here to whisper to.`
              });
              if (error) console.error("Error inserting target not found message:", error);
            } else {
              // Send whisper message - only visible to target character
              console.log(`Sending whisper from ${characterName} to ${targetChar.name} (ID: ${targetChar.id})`);
              const { error } = await supabase.from("room_messages").insert({
                room_id: currentRoomId,
                character_id: cmd.character_id,
                character_name: characterName,
                target_character_id: targetChar.id,
                kind: "whisper",
                body: `${characterName} whispers to you: "${whisperMessage}"`
              });

              if (error) {
                console.error("Error inserting whisper message:", error);
              } else {
                console.log("Whisper message sent successfully");

                // Also send a confirmation to the sender (only they can see this)
                const { error: confirmError } = await supabase.from("room_messages").insert({
                  room_id: currentRoomId,
                  character_id: cmd.character_id,
                  character_name: characterName,
                  target_character_id: cmd.character_id, // Only visible to sender
                  kind: "system",
                  body: `You whisper to ${targetChar.name}: "${whisperMessage}"`
                });

                if (confirmError) {
                  console.error("Error inserting whisper confirmation:", confirmError);
                }
              }
            }

          } else if (raw === "who") {
            console.log("Processing WHO command");
            
            // List all characters and NPCs in the current room
            const charsResult = await supabase
              .from("characters")
              .select("name")
              .eq("current_room", cmd.room_id)
              .neq("id", cmd.character_id || actorId);
            const otherChars = charsResult.data || [];

            const { data: npcs } = await supabase
              .from("npcs")
              .select("name, alias")
              .eq("current_room", cmd.room_id);

            let whoList = "";

            // Add characters section if any exist
            if (otherChars && otherChars.length > 0) {
              whoList += "[CHARACTERS]\n" + otherChars.map(c => `• ${c.name}`).join("\n");
            }

            // Add NPCs section if any exist
            if (npcs && npcs.length > 0) {
              if (whoList) whoList += "\n\n"; // Add spacing if characters section exists
              whoList += "[NPCs]\n" + npcs.map(n => `• ${n.name} (talk ${n.alias})`).join("\n");
            }

            // If no one else is present
            if ((!otherChars || otherChars.length === 0) && (!npcs || npcs.length === 0)) {
              whoList = "You are alone here.";
            }

            const { error } = await supabase.from("room_messages").insert({
              room_id: cmd.room_id,
              kind: "system",
              body: whoList
            });

            if (error) {
              console.error("Error inserting who list:", error);
            } else {
              console.log("Who list inserted successfully");
            }

          } else if (raw.startsWith("inspect ")) {
            console.log("Processing INSPECT command");
            const targetName = raw.substring(8).trim().toLowerCase();
            
            if (!targetName) {
              const { error } = await supabase.from("room_messages").insert({
                room_id: cmd.room_id,
                kind: "error",
                body: "Usage: inspect <name>"
              });
              if (error) console.error("Error inserting inspect usage:", error);
              continue;
            }
            
            // Look for character by name
            const { data: chars } = await supabase
              .from("characters")
              .select("name, description")
              .eq("current_room", cmd.room_id)
              .ilike("name", targetName);
            
            const targetChar = chars?.[0];
            
            let inspectResult = "";
            
            if (targetChar) {
              // Show character description if available, otherwise show generic message
              const description = targetChar.description || "A persona inhabiting the Arkyv.";
              inspectResult = `[${targetChar.name.toUpperCase()}]\n${description}`;
            } else {
              inspectResult = `No one by that name is here.`;
            }
            
            const { error } = await supabase.from("room_messages").insert({
              room_id: cmd.room_id,
              kind: "system",
              body: inspectResult
            });
            
            if (error) {
              console.error("Error inserting inspect result:", error);
            } else {
              console.log("Inspect result inserted successfully");
            }

          } else if (raw === "__GREET") {
            // Special command to trigger NPC greetings without movement
            // This is used when a character first enters the game
            console.log(`🎉 __GREET command received for character ${characterName} (${cmd.character_id}) in room ${cmd.room_id}`);
            try {
              await handleNPCGreetings(cmd.room_id, cmd.character_id, characterName, supabase, openaiKey);
              console.log(`✅ __GREET processing complete for ${characterName}`);
            } catch (greetError) {
              console.error(`❌ Error processing __GREET for ${characterName}:`, greetError);
            }
            
          } else {
            // Handle movement commands
            console.log(`Attempting movement: "${raw}" from room ${cmd.room_id}`);

            const { data: exits, error: exitError } = await supabase
              .from("exits")
              .select("to_room")
              .eq("from_room", cmd.room_id)
              .eq("verb", raw);

            if (exitError) {
              console.error("Error fetching exit:", exitError);
            }

            console.log(`Found ${exits?.length || 0} matching exits for "${raw}"`);

            const exit = exits?.[0]; // Take the first matching exit

            if (exit?.to_room) {
              // Update location: profile or character
              let updateError = null;
              if (isProfile) {
                const res = await supabase
                  .from("profiles")
                  .update({ current_room: exit.to_room })
                  .eq("id", actorId);
                updateError = res.error;
              } else {
                const res = await supabase
                  .from("characters")
                  .update({ current_room: exit.to_room })
                  .eq("id", cmd.character_id);
                updateError = res.error;
              }

              if (updateError) {
                console.error("Error updating character location:", updateError);
              }

              // Insert arrival message
              const { error: arrivalError } = await supabase.from("room_messages").insert({
                room_id: exit.to_room,
                character_id: cmd.character_id,
                character_name: characterName,
                kind: "system",
                body: `${characterName} arrives.`
              });

              if (arrivalError) {
                console.error("Error inserting arrival message:", arrivalError);
              }

              // Generate environment data (exits, NPCs, characters) for the new room
              // This updates the environment panel without showing a LOOK command in terminal
              try {
                // Get exits from new room
                const { data: newRoomExits } = await supabase
                  .from("exits")
                  .select("verb, to_room, rooms!exits_to_room_fkey(name)")
                  .eq("from_room", exit.to_room);
                
                // Get NPCs in new room
                const { data: newRoomNpcs } = await supabase
                  .from("npcs")
                  .select("name, alias")
                  .eq("current_room", exit.to_room);
                
                // Get characters in new room (excluding current actor if in character mode)
                let charsQuery = supabase
                  .from("characters")
                  .select("name")
                  .eq("current_room", exit.to_room);
                
                // Only exclude if we're in character mode (not profile mode)
                if (cmd.character_id) {
                  charsQuery = charsQuery.neq("id", cmd.character_id);
                }
                
                const { data: newRoomChars } = await charsQuery;
                
                // Build environment data message - always include all sections to clear old data
                let envData = "";
                
                // Always include EXITS section
                if (newRoomExits && newRoomExits.length > 0) {
                  const exitList = newRoomExits.map(e => {
                    const roomName = e.rooms?.name || 'unknown destination';
                    return `• ${e.verb} → ${roomName}`;
                  }).join("\n");
                  envData += `[EXITS]\n${exitList}`;
                } else {
                  envData += `[EXITS]\n`;
                }
                
                // Always include NPCs section
                if (newRoomNpcs && newRoomNpcs.length > 0) {
                  if (envData) envData += "\n\n";
                  const npcList = newRoomNpcs.map(n => `• ${n.name} (talk ${n.alias})`).join("\n");
                  envData += `[NPCs]\n${npcList}`;
                } else {
                  envData += "\n\n[NPCs]\n";
                }
                
                // Always include CHARACTERS section
                if (newRoomChars && newRoomChars.length > 0) {
                  if (envData) envData += "\n\n";
                  const charList = newRoomChars.map(c => `• ${c.name}`).join("\n");
                  envData += `[CHARACTERS]\n${charList}`;
                } else {
                  envData += "\n\n[CHARACTERS]\n";
                }
                
                // Always insert environment data message to clear old data
                console.log(`🔍 Inserting ENV_DATA for room ${exit.to_room}, isProfile: ${isProfile}`);
                console.log(`🔍 ENV_DATA body:`, envData);
                
                const { error: envInsertError } = await supabase.from("room_messages").insert({
                  room_id: exit.to_room,
                  character_id: null,
                  kind: "system",
                  body: `[ENV_DATA]\n${envData}`
                  // No target_character_id - public message but won't display due to [ENV_DATA] prefix
                });
                
                if (envInsertError) {
                  console.error("❌ Failed to insert ENV_DATA:", envInsertError);
                } else {
                  console.log(`✅ ENV_DATA inserted successfully`);
                }
              } catch (envErr) {
                console.error("Failed to generate environment data:", envErr);
              }
              
              // Handle NPC greetings for room entry
              await handleNPCGreetings(exit.to_room, cmd.character_id, characterName, supabase, openaiKey);
            } else {
              // Invalid command or no exit found
              console.log(`No exit found for "${raw}" from room ${cmd.room_id}`);
              const { error } = await supabase.from("room_messages").insert({
                room_id: cmd.room_id,
                kind: "system",
                body: `You cannot go "${raw}" from here. Type "exits" to see available directions.`
              });
              if (error) {
                console.error("Error inserting error message:", error);
              }
            }
          }

          // Mark command as processed
          const { error: processError } = await supabase
            .from("commands")
            .update({ processed_at: new Date().toISOString() })
            .eq("id", cmd.id);

          if (processError) {
            console.error("Error marking command as processed:", processError);
          } else {
            console.log(`Command ${cmd.id} marked as processed`);
          }

      } catch (cmdError) {
        console.error(`Error processing command ${cmd.id}:`, cmdError);
        // Still mark as processed to avoid infinite loops
        await supabase
          .from("commands")
          .update({ processed_at: new Date().toISOString() })
          .eq("id", cmd.id);
      }
    }

    console.log("Command processing complete");
    return new Response("processed");

  } catch (error) {
    console.error("Command processor error:", error);
    return new Response(`error: ${error.message}`, { status: 500 });
  }
}

// Handle NPC greetings when a character enters a room
async function handleNPCGreetings(roomId, characterId, characterName, supabase, openaiKey) {
  try {
    const isProfileMode = !characterId;
    console.log(`🔍 Checking for NPC greetings in room ${roomId} for ${isProfileMode ? 'profile' : 'character'} ${characterName} (ID: ${characterId || 'PROFILE'})`);

    // Get NPCs in the room
    const { data: npcs, error: npcError } = await supabase
      .from("npcs")
      .select("name, alias, description, dialogue_tree, greeting_behavior")
      .eq("current_room", roomId)
      .neq("greeting_behavior", "none");

    if (npcError) {
      console.error(`❌ Error fetching NPCs for greetings:`, npcError);
      return;
    }

    console.log(`🔍 Found ${npcs?.length || 0} NPCs with greeting behavior in room ${roomId}`, npcs?.map(n => ({ name: n.name, behavior: n.greeting_behavior })));

    if (!npcs || npcs.length === 0) {
      return; // No NPCs with greeting behavior
    }

    // Verify actor is still in the room (only if in character mode)
    if (!isProfileMode) {
      // Character mode - verify they're still in the room
      const { data: character } = await supabase
        .from("characters")
        .select("name, current_room")
        .eq("id", characterId)
        .single();
      
      // Important: Check if character is still in the room
      // They may have moved before this async greeting was processed
      if (!character || character.current_room !== roomId) {
        console.log(`⚠️ Character ${characterName} has left room ${roomId} (now in ${character?.current_room}), skipping greetings`);
        return;
      }
      
      console.log(`✅ Character ${characterName} is still in room ${roomId}, proceeding with greetings`);
    } else {
      // Profile mode - greetings are always public since we can't target a profile with whispers
      console.log(`✅ Profile ${characterName} in room ${roomId}, proceeding with PUBLIC greetings only`);
    }

    for (const npc of npcs) {
      console.log(`🔍 Processing greeting for NPC: ${npc.name} (${npc.alias}) with behavior: ${npc.greeting_behavior}`);

      const npcName = npc.name;  // Use just the name, not the alias
      let greetingMessage = "";
      let isPublic = true;
      let targetCharacterId = null;

      // Determine greeting type based on behavior
      const behavior = npc.greeting_behavior || "none";

      // In profile mode, all greetings must be public (can't whisper to a profile)
      if (isProfileMode) {
        isPublic = true;
        greetingMessage = `${npcName}: "Ah, ${characterName} has arrived."`;
      } else if (behavior === "private") {
        isPublic = false;
        targetCharacterId = characterId;
        greetingMessage = `${npcName} whispers to you: "Welcome, ${characterName}."`;
      } else if (behavior === "public") {
        isPublic = true;
        greetingMessage = `${npcName}: "Ah, ${characterName} has arrived."`;
      } else if (behavior === "random") {
        // Randomly choose between public and private
        isPublic = Math.random() < 0.5;
        if (isPublic) {
          greetingMessage = `${npcName}: "Welcome to our gathering, ${characterName}."`;
        } else {
          targetCharacterId = characterId;
          greetingMessage = `${npcName} whispers to you: "You intrigue me, ${characterName}."`;
        }
      }

      // Generate AI greeting if NPC has personality (skip for random behavior)
      if (npc.dialogue_tree?.personality && behavior !== "random") {
        try {
          const personalityPrompt = npc.dialogue_tree.personality;
          
          const messages = [
            {
              role: 'system',
              content: `${personalityPrompt}

INSTRUCTIONS: Generate a brief greeting message (1-2 sentences) for when ${characterName} enters the room. Keep it in character and natural. Do not include any speaker labels or formatting - just the greeting text.`
            },
            {
              role: 'user',
              content: `${characterName} has just entered the room.`
            }
          ];

          const aiData = await createChatCompletion({
            messages: messages,
            modelType: 'fast',
            maxTokens: 100,
            temperature: 0.8
          });

          const aiResponse = aiData?.choices?.[0]?.message?.content || "greets you with a mysterious gaze.";

          if (aiResponse) {
            greetingMessage = isPublic
              ? `${npcName}: "${aiResponse}"`
              : `${npcName} whispers to you: "${aiResponse}"`;
          }
        } catch (aiError) {
          console.error("Error generating AI greeting:", aiError);
          // Fall back to default greeting
          greetingMessage = isPublic
            ? `${npcName}: "Welcome, seeker of knowledge."`
            : `${npcName} whispers to you: "The shadows hold many secrets."`;
        }
      }

      // Final check: verify character is still in room before inserting greeting (skip for profile mode)
      if (!isProfileMode) {
        const { data: finalCheck } = await supabase
          .from("characters")
          .select("current_room")
          .eq("id", characterId)
          .single();
        
        if (finalCheck?.current_room !== roomId) {
          console.log(`⚠️ Character moved during greeting generation (now in ${finalCheck?.current_room}), skipping greeting from ${npc.name}`);
          continue;
        }
      }
      
      // Insert the greeting message
      console.log(`🔍 Inserting ${isPublic ? 'public' : 'private'} greeting from ${npc.name}: ${greetingMessage.substring(0, 50)}...`);
      const { error: greetingError } = await supabase.from("room_messages").insert({
        room_id: roomId,
        character_id: null, // NPC messages don't have a character_id
        character_name: null, // NPC messages don't have a character_name
        target_character_id: isPublic ? null : characterId, 
        kind: isPublic ? "npc_speech" : "npc_whisper",
        body: greetingMessage
      });

      if (greetingError) {  
        console.error("Error inserting NPC greeting:", greetingError);
      } else {
        console.log(`✅ NPC greeting inserted successfully: ${greetingMessage}`);
      }
    }
  } catch (error) {
    console.error("Error handling NPC greetings:", error);
  }
}
