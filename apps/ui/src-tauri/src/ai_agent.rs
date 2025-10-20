use futures_util::StreamExt;
/**
 * Native Rust AI Agent using direct Anthropic API
 *
 * Replaces the Node.js sidecar with pure Rust implementation.
 */
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::cmd::{
    apply_edit, get_current_code, get_diagnostics, get_preview_screenshot, trigger_render,
    EditorState,
};

// ============================================================================
// Message Types
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Clone)]
struct StreamEvent {
    #[serde(rename = "type")]
    event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "toolName")]
    tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    args: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

// ============================================================================
// Tool Definitions & Execution
// ============================================================================

fn get_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "get_current_code",
            "description": "Get the current OpenSCAD code from the editor buffer",
            "input_schema": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }),
        json!({
            "name": "get_preview_screenshot",
            "description": "Get the file path to the current 3D/2D preview render. Use this to see what the design looks like.",
            "input_schema": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }),
        json!({
            "name": "apply_edit",
            "description": "Apply code changes by replacing an exact substring with new content. The old text must exist exactly once in the code. Max 120 lines changed. The code will be test-compiled with OpenSCAD and rolled back if validation fails or new errors are introduced.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "old_string": {
                        "type": "string",
                        "description": "The exact text to find and replace. Must be unique in the file."
                    },
                    "new_string": {
                        "type": "string",
                        "description": "The replacement text"
                    },
                    "rationale": {
                        "type": "string",
                        "description": "Brief explanation of what this change accomplishes"
                    }
                },
                "required": ["old_string", "new_string", "rationale"]
            }
        }),
        json!({
            "name": "get_diagnostics",
            "description": "Get current compilation errors and warnings from OpenSCAD",
            "input_schema": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }),
        json!({
            "name": "trigger_render",
            "description": "Manually trigger a render to update the preview pane with the latest code changes",
            "input_schema": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }),
    ]
}

/// Execute a tool call
async fn execute_tool(tool_name: &str, args: Value, app: &AppHandle) -> Result<String, String> {
    match tool_name {
        "get_current_code" => {
            let state: State<EditorState> = app.state();
            get_current_code(state).map(|code| {
                if code.is_empty() {
                    "// Empty file".to_string()
                } else {
                    code
                }
            })
        }
        "get_preview_screenshot" => {
            let state: State<EditorState> = app.state();
            get_preview_screenshot(state)
                .map(|path| format!("Preview image saved at: {path}\n\nThis shows the current rendered output of the OpenSCAD code."))
        }
        "apply_edit" => {
            let old_string = args["old_string"]
                .as_str()
                .ok_or("Missing old_string")?
                .to_string();
            let new_string = args["new_string"]
                .as_str()
                .ok_or("Missing new_string")?
                .to_string();
            let rationale = args["rationale"]
                .as_str()
                .ok_or("Missing rationale")?
                .to_string();

            let state: State<EditorState> = app.state();
            let openscad_path = state.openscad_path.lock().unwrap().clone();

            let result =
                apply_edit(app.clone(), old_string, new_string, state, openscad_path).await?;

            if !result.success {
                let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());

                // Format diagnostics in a readable way (same format as get_diagnostics)
                let diag_text = if !result.diagnostics.is_empty() {
                    let formatted: Vec<String> = result
                        .diagnostics
                        .iter()
                        .map(|d| {
                            let location = if let Some(line) = d.line {
                                if let Some(col) = d.col {
                                    format!(" (line {line}, col {col})")
                                } else {
                                    format!(" (line {line})")
                                }
                            } else {
                                String::new()
                            };
                            format!("  [{:?}]{location}: {}", d.severity, d.message)
                        })
                        .collect();
                    format!(
                        "\n\nCompilation errors after applying edit:\n{}",
                        formatted.join("\n")
                    )
                } else {
                    String::new()
                };

                Ok(format!(
                    "❌ Failed to apply edit: {error_msg}{diag_text}\n\nRationale: {rationale}\n\nThe edit was rolled back. No changes were made. Please fix the errors and try again."
                ))
            } else {
                // Include checkpoint_id in success message so frontend can associate it
                let checkpoint_info = if let Some(checkpoint_id) = &result.checkpoint_id {
                    format!("\n\n[CHECKPOINT:{checkpoint_id}]")
                } else {
                    String::new()
                };

                Ok(format!(
                    "✅ Edit applied successfully!\n✅ Code compiles without new errors\n✅ Preview has been updated automatically\n\nRationale: {rationale}\n\nThe changes are now live in the editor.{checkpoint_info}"
                ))
            }
        }
        "get_diagnostics" => {
            let state: State<EditorState> = app.state();
            let diagnostics = get_diagnostics(state)?;

            if diagnostics.is_empty() {
                Ok("✅ No errors or warnings. The code compiles successfully.".to_string())
            } else {
                let formatted: Vec<String> = diagnostics
                    .iter()
                    .map(|d| {
                        let location = if let Some(line) = d.line {
                            if let Some(col) = d.col {
                                format!(" (line {line}, col {col})")
                            } else {
                                format!(" (line {line})")
                            }
                        } else {
                            String::new()
                        };
                        format!("[{:?}]{location}: {}", d.severity, d.message)
                    })
                    .collect();

                Ok(format!("Current diagnostics:\n\n{}", formatted.join("\n")))
            }
        }
        "trigger_render" => {
            trigger_render(app.clone()).await?;
            Ok("✅ Render triggered. Check the preview pane for the updated output.".to_string())
        }
        _ => Err(format!("Unknown tool: {tool_name}")),
    }
}

// ============================================================================
// System Prompt
// ============================================================================

fn build_system_prompt() -> String {
    r#"## OpenSCAD AI Assistant

You are an expert OpenSCAD assistant helping users design and modify 3D models. You have access to tools that let you see the current code, view the rendered preview, and make targeted code changes.

### Your Capabilities:
- **View code**: Use `get_current_code` to see what you're working with
- **See the design**: Use `get_preview_screenshot` to see the rendered output
- **Check for errors**: Use `get_diagnostics` to check compilation errors and warnings
- **Make changes**: Use `apply_edit` to modify the code with exact string replacement
- **Update preview**: Use `trigger_render` to manually refresh the preview

### Critical Rules for Editing:
1. **ALWAYS use exact string replacement**: Never output full file replacements. Use `apply_edit` with exact substrings.
2. **Provide exact substrings**: The `old_string` must match exactly (including whitespace and indentation) and must be unique in the file.
3. **Keep changes small**: Maximum 120 lines changed per edit. Break large changes into multiple steps.
4. **Automatic validation**: `apply_edit` validates the edit and test-compiles the code before applying. If validation fails, the error will be returned and no changes are made.
5. **Include context**: Make the `old_string` large enough to be unique - include surrounding lines if needed.

### Recommended Workflow:
1. Start by calling `get_current_code` to understand what exists
2. Optionally use `get_preview_screenshot` to see the rendered output
3. For fixes, use `get_diagnostics` to see what errors exist
4. Use `apply_edit` with the exact old text, new replacement, and a rationale explaining the change
5. The preview updates automatically after successful edits

### OpenSCAD Quick Reference:

**3D Primitives:**
- `cube([x, y, z]);` or `cube(size);`
- `sphere(r);` or `sphere(d);`
- `cylinder(h, r1, r2);` or `cylinder(h, d1, d2);`

**2D Primitives:**
- `circle(r);` or `circle(d);`
- `square([x, y]);` or `square(size);`
- `polygon(points);`

**Transformations:**
- `translate([x, y, z]) { ... }`
- `rotate([rx, ry, rz]) { ... }`
- `scale([sx, sy, sz]) { ... }`
- `mirror([x, y, z]) { ... }`

**Boolean Operations:**
- `union() { ... }` - combines objects (default)
- `difference() { ... }` - subtracts subsequent objects from first
- `intersection() { ... }` - keeps only overlapping parts

**2D to 3D:**
- `linear_extrude(height) { ... }`
- `rotate_extrude(angle) { ... }`

**Modifiers:**
- `#` - debug (show in transparent red)
- `%` - background (show transparently)
- `*` - disable (don't render)
- `!` - show only this

**Control Structures:**
- `for (i = [start:end]) { ... }`
- `if (condition) { ... }`
- Variables: `x = 10;`
- Functions: `function name(params) = expression;`
"#.to_string()
}

// ============================================================================
// AI Agent State
// ============================================================================

pub struct AiAgentState {
    pub api_key: Arc<Mutex<Option<String>>>,
    pub provider: Arc<Mutex<String>>,
    pub cancellation_token: Arc<Mutex<Option<CancellationToken>>>,
}

impl AiAgentState {
    pub fn new() -> Self {
        Self {
            api_key: Arc::new(Mutex::new(None)),
            provider: Arc::new(Mutex::new("anthropic".to_string())),
            cancellation_token: Arc::new(Mutex::new(None)),
        }
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Initialize AI agent with API key
#[tauri::command]
pub async fn start_ai_agent(
    api_key: String,
    provider: String,
    state: State<'_, AiAgentState>,
) -> Result<(), String> {
    eprintln!("[AI Agent] Starting with provider: {provider}");
    *state.api_key.lock().await = Some(api_key);
    *state.provider.lock().await = provider;
    Ok(())
}

/// Stop AI agent
#[tauri::command]
pub async fn stop_ai_agent(state: State<'_, AiAgentState>) -> Result<(), String> {
    eprintln!("[AI Agent] Stopping");
    *state.api_key.lock().await = None;
    Ok(())
}

/// Send query to AI agent with streaming response
#[tauri::command]
pub async fn send_ai_query(
    app: AppHandle,
    messages: Vec<Message>,
    model: Option<String>,
    provider: Option<String>,
    ai_state: State<'_, AiAgentState>,
) -> Result<(), String> {
    let msg_count = messages.len();
    eprintln!("[AI Agent] Received query with {msg_count} messages");

    // Use provided model or fall back to stored settings
    use crate::cmd::ai::{get_ai_model, get_api_key_for_provider};
    let model = match model {
        Some(m) => {
            eprintln!("[AI Agent] Using provided model: {m}");
            m
        }
        None => {
            let stored_model = get_ai_model(app.clone())?;
            eprintln!("[AI Agent] Using stored model: {stored_model}");
            stored_model
        }
    };

    // Use provided provider or fall back to stored settings
    use crate::cmd::ai::get_ai_provider;
    let provider = match provider {
        Some(p) => {
            eprintln!("[AI Agent] Using provided provider: {p}");
            p
        }
        None => {
            let stored_provider = get_ai_provider(app.clone());
            eprintln!("[AI Agent] Using stored provider: {stored_provider}");
            stored_provider
        }
    };

    // Get API key for the specific provider
    let api_key = get_api_key_for_provider(app.clone(), &provider)?;
    eprintln!("[AI Agent] Retrieved API key for provider: {provider}");

    // Create cancellation token for this request
    let cancel_token = CancellationToken::new();
    *ai_state.cancellation_token.lock().await = Some(cancel_token.clone());

    // Spawn background task for streaming
    tokio::spawn(async move {
        let app_for_error = app.clone();
        let result = if provider == "openai" {
            run_openai_query(app, messages, api_key, model, cancel_token).await
        } else {
            run_ai_query(app, messages, api_key, model, cancel_token).await
        };

        if let Err(e) = result {
            eprintln!("[AI Agent] Error: {e}");
            let _ = app_for_error.emit(
                "ai-stream",
                StreamEvent {
                    event_type: "error".to_string(),
                    content: None,
                    tool_name: None,
                    args: None,
                    result: None,
                    error: Some(e),
                },
            );
        }
    });

    Ok(())
}

/// Run AI query with streaming (background task) - supports multi-turn tool calling
async fn run_ai_query(
    app: AppHandle,
    messages: Vec<Message>,
    api_key: String,
    model: String,
    cancel_token: CancellationToken,
) -> Result<(), String> {
    eprintln!("[AI Agent] Starting API call to Anthropic with model: {model}");

    // Convert messages to Anthropic format
    let mut api_messages = vec![];
    for msg in messages {
        api_messages.push(json!({
            "role": msg.role,
            "content": msg.content
        }));
    }

    // Multi-turn conversation loop for tool calling
    loop {
        // Check for cancellation before starting new turn
        if cancel_token.is_cancelled() {
            eprintln!("[AI Agent] Request cancelled by user");
            return Ok(());
        }

        // Build request
        let request_body = json!({
            "model": model,
            "max_tokens": 8000,
            "system": build_system_prompt(),
            "messages": api_messages.clone(),
            "tools": get_tool_definitions(),
            "stream": true
        });

        eprintln!("[AI Agent] Sending request to Anthropic API (conversation turn)");

        let client = reqwest::Client::new();
        let response = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Failed to send request: {e}"))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("API error: {error_text}"));
        }

        eprintln!("[AI Agent] Processing streaming response");

        // Process streaming response incrementally
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut current_tool_use_id: Option<String> = None;
        let mut current_tool_name: Option<String> = None;
        let mut current_tool_input = String::new();
        let mut assistant_content = Vec::new(); // Collect all content blocks
        let mut tool_results = Vec::new(); // Collect tool results for next turn
        let mut has_tool_use = false;

        // Parse SSE format incrementally
        while let Some(chunk_result) = stream.next().await {
            // Check for cancellation in stream processing
            if cancel_token.is_cancelled() {
                eprintln!("[AI Agent] Stream cancelled by user");
                return Ok(());
            }

            let chunk = chunk_result.map_err(|e| format!("Stream error: {e}"))?;
            let chunk_str = String::from_utf8_lossy(&chunk);
            buffer.push_str(&chunk_str);

            // Process complete lines
            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].trim().to_string();
                buffer = buffer[newline_pos + 1..].to_string();

                if line.is_empty() {
                    continue;
                }
                if let Some(data) = line.strip_prefix("data: ") {
                    if data == "[DONE]" {
                        break;
                    }

                    if let Ok(event) = serde_json::from_str::<Value>(data) {
                        match event["type"].as_str() {
                            Some("content_block_start") => {
                                if let Some(content_block) = event["content_block"].as_object() {
                                    if content_block["type"].as_str() == Some("tool_use") {
                                        let tool_name = content_block["name"]
                                            .as_str()
                                            .unwrap_or_default()
                                            .to_string();
                                        let tool_id = content_block["id"]
                                            .as_str()
                                            .unwrap_or_default()
                                            .to_string();

                                        eprintln!("[AI Agent] Tool use started: {tool_name}");

                                        current_tool_use_id = Some(tool_id);
                                        current_tool_name = Some(tool_name.clone());
                                        current_tool_input.clear();

                                        let _ = app.emit(
                                            "ai-stream",
                                            StreamEvent {
                                                event_type: "tool-call".to_string(),
                                                content: None,
                                                tool_name: Some(tool_name),
                                                args: Some(json!({})),
                                                result: None,
                                                error: None,
                                            },
                                        );
                                    } else if content_block["type"].as_str() == Some("text") {
                                        // Track that we're starting a text block
                                        let is_new_text_block = assistant_content.is_empty()
                                            || assistant_content
                                                .last()
                                                .and_then(|v: &Value| v.get("type"))
                                                .and_then(|v| v.as_str())
                                                != Some("text");

                                        if is_new_text_block {
                                            assistant_content.push(json!({
                                                "type": "text",
                                                "text": ""
                                            }));
                                        }
                                    }
                                }
                            }
                            Some("content_block_delta") => {
                                if let Some(delta) = event["delta"].as_object() {
                                    if delta["type"].as_str() == Some("text_delta") {
                                        if let Some(text) = delta["text"].as_str() {
                                            eprintln!("[AI Agent] Text delta: {text}");

                                            // Add text to assistant content
                                            if let Some(last_block) = assistant_content.last_mut() {
                                                if last_block.get("type").and_then(|v| v.as_str())
                                                    == Some("text")
                                                {
                                                    if let Some(current_text) = last_block
                                                        .get("text")
                                                        .and_then(|v| v.as_str())
                                                    {
                                                        last_block["text"] =
                                                            json!(format!("{current_text}{text}"));
                                                    }
                                                }
                                            } else {
                                                // First text block
                                                assistant_content.push(json!({
                                                    "type": "text",
                                                    "text": text
                                                }));
                                            }

                                            let _ = app.emit(
                                                "ai-stream",
                                                StreamEvent {
                                                    event_type: "text".to_string(),
                                                    content: Some(text.to_string()),
                                                    tool_name: None,
                                                    args: None,
                                                    result: None,
                                                    error: None,
                                                },
                                            );
                                        }
                                    } else if delta["type"].as_str() == Some("input_json_delta") {
                                        if let Some(partial_json) = delta["partial_json"].as_str() {
                                            current_tool_input.push_str(partial_json);
                                        }
                                    }
                                }
                            }
                            Some("content_block_stop") => {
                                // Tool use complete - execute it and store result for next turn
                                if let (Some(tool_name), Some(tool_id)) =
                                    (current_tool_name.clone(), current_tool_use_id.clone())
                                {
                                    has_tool_use = true;
                                    eprintln!("[AI Agent] Executing tool: {tool_name}");
                                    eprintln!("[AI Agent] Tool input: {current_tool_input}");

                                    let tool_args: Value =
                                        serde_json::from_str(&current_tool_input)
                                            .unwrap_or_else(|_| json!({}));

                                    // Add tool use to assistant content
                                    assistant_content.push(json!({
                                        "type": "tool_use",
                                        "id": tool_id.clone(),
                                        "name": tool_name.clone(),
                                        "input": tool_args.clone()
                                    }));

                                    match execute_tool(&tool_name, tool_args, &app).await {
                                        Ok(result) => {
                                            eprintln!(
                                                "[AI Agent] Tool result: {}",
                                                &result[..result.len().min(100)]
                                            );
                                            let _ = app.emit(
                                                "ai-stream",
                                                StreamEvent {
                                                    event_type: "tool-result".to_string(),
                                                    content: None,
                                                    tool_name: Some(tool_name.clone()),
                                                    args: None,
                                                    result: Some(json!(result.clone())),
                                                    error: None,
                                                },
                                            );

                                            // Store tool result for next API call
                                            tool_results.push(json!({
                                                "type": "tool_result",
                                                "tool_use_id": tool_id,
                                                "content": result
                                            }));
                                        }
                                        Err(e) => {
                                            eprintln!("[AI Agent] Tool error: {e}");
                                            let _ = app.emit(
                                                "ai-stream",
                                                StreamEvent {
                                                    event_type: "error".to_string(),
                                                    content: None,
                                                    tool_name: None,
                                                    args: None,
                                                    result: None,
                                                    error: Some(format!(
                                                        "Tool execution failed: {e}"
                                                    )),
                                                },
                                            );

                                            // Store error as tool result
                                            tool_results.push(json!({
                                                "type": "tool_result",
                                                "tool_use_id": tool_id,
                                                "content": format!("Error: {e}"),
                                                "is_error": true
                                            }));
                                        }
                                    }

                                    current_tool_use_id = None;
                                    current_tool_name = None;
                                    current_tool_input.clear();
                                }
                            }
                            Some("message_stop") => {
                                eprintln!("[AI Agent] Stream complete");
                            }
                            _ => {}
                        }
                    }
                }
            }
        }

        eprintln!("[AI Agent] Stream processing complete");

        // Check if we need to continue conversation with tool results
        if has_tool_use && !tool_results.is_empty() {
            let result_count = tool_results.len();
            eprintln!("[AI Agent] Continuing conversation with {result_count} tool results");

            // Add assistant message with tool uses
            api_messages.push(json!({
                "role": "assistant",
                "content": assistant_content
            }));

            // Add user message with tool results
            api_messages.push(json!({
                "role": "user",
                "content": tool_results
            }));

            // Continue loop to get Claude's response
            continue;
        } else {
            // No more tools, conversation complete
            eprintln!("[AI Agent] No tool use detected, ending conversation");
            break;
        }
    } // End of loop

    // Send final done event
    let _ = app.emit(
        "ai-stream",
        StreamEvent {
            event_type: "done".to_string(),
            content: None,
            tool_name: None,
            args: None,
            result: None,
            error: None,
        },
    );

    eprintln!("[AI Agent] Query complete");
    Ok(())
}

/// Run OpenAI query with streaming (background task) - supports multi-turn tool calling
async fn run_openai_query(
    app: AppHandle,
    messages: Vec<Message>,
    api_key: String,
    model: String,
    cancel_token: CancellationToken,
) -> Result<(), String> {
    eprintln!("[AI Agent] Starting API call to OpenAI with model: {model}");

    // Convert messages to OpenAI format
    let mut api_messages = vec![];
    for msg in messages {
        api_messages.push(json!({
            "role": msg.role,
            "content": msg.content
        }));
    }

    // Build messages array with system prompt
    let mut all_messages = vec![json!({
        "role": "system",
        "content": build_system_prompt()
    })];
    all_messages.extend(api_messages.clone());

    // Build tools array
    let tools: Vec<Value> = get_tool_definitions()
        .iter()
        .map(|t| {
            json!({
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["input_schema"]
                }
            })
        })
        .collect();

    // Multi-turn conversation loop
    loop {
        // Check for cancellation before starting new turn
        if cancel_token.is_cancelled() {
            eprintln!("[AI Agent] Request cancelled by user");
            return Ok(());
        }

        // Build request
        let request_body = json!({
            "model": model,
            "messages": all_messages.clone(),
            "tools": tools,
            "stream": true
        });

        eprintln!("[AI Agent] Sending request to OpenAI API (conversation turn)");

        let client = reqwest::Client::new();
        let response = client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {api_key}"))
            .header("content-type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Failed to send request: {e}"))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("API error: {error_text}"));
        }

        eprintln!("[AI Agent] Processing streaming response");

        // Process streaming response incrementally
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        // Track tool calls by index (OpenAI streams them incrementally)
        let mut tool_calls: std::collections::HashMap<usize, (String, String)> =
            std::collections::HashMap::new();
        let mut tool_call_emitted: std::collections::HashSet<usize> =
            std::collections::HashSet::new();

        while let Some(chunk_result) = stream.next().await {
            // Check for cancellation in stream processing
            if cancel_token.is_cancelled() {
                eprintln!("[AI Agent] Stream cancelled by user");
                return Ok(());
            }

            let chunk = chunk_result.map_err(|e| format!("Stream error: {e}"))?;
            let chunk_str = String::from_utf8_lossy(&chunk);
            buffer.push_str(&chunk_str);

            // Process complete lines
            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].trim().to_string();
                buffer = buffer[newline_pos + 1..].to_string();

                if line.is_empty() || !line.starts_with("data: ") {
                    continue;
                }

                let data = &line[6..];
                if data == "[DONE]" {
                    break;
                }

                if let Ok(event) = serde_json::from_str::<Value>(data) {
                    if let Some(choices) = event.get("choices").and_then(|v| v.as_array()) {
                        if let Some(choice) = choices.first() {
                            if let Some(delta) = choice.get("delta").and_then(|v| v.as_object()) {
                                // Handle text content
                                if let Some(content) = delta.get("content").and_then(|v| v.as_str())
                                {
                                    eprintln!("[AI Agent] Text delta: {content}");
                                    let _ = app.emit(
                                        "ai-stream",
                                        StreamEvent {
                                            event_type: "text".to_string(),
                                            content: Some(content.to_string()),
                                            tool_name: None,
                                            args: None,
                                            result: None,
                                            error: None,
                                        },
                                    );
                                }

                                // Handle tool calls (streamed incrementally)
                                if let Some(tool_calls_delta) =
                                    delta.get("tool_calls").and_then(|v| v.as_array())
                                {
                                    for tool_call in tool_calls_delta {
                                        if let Some(index) =
                                            tool_call.get("index").and_then(|v| v.as_u64())
                                        {
                                            let index = index as usize;

                                            // Get or create entry for this tool call
                                            let entry = tool_calls
                                                .entry(index)
                                                .or_insert((String::new(), String::new()));

                                            // Update name if provided
                                            if let Some(function) = tool_call
                                                .get("function")
                                                .and_then(|v| v.as_object())
                                            {
                                                if let Some(name) =
                                                    function.get("name").and_then(|v| v.as_str())
                                                {
                                                    entry.0 = name.to_string();

                                                    // Emit tool-call event when we first see the name
                                                    if !tool_call_emitted.contains(&index) {
                                                        eprintln!(
                                                            "[AI Agent] Tool call started: {name}"
                                                        );
                                                        let _ = app.emit(
                                                            "ai-stream",
                                                            StreamEvent {
                                                                event_type: "tool-call".to_string(),
                                                                content: None,
                                                                tool_name: Some(name.to_string()),
                                                                args: Some(json!({})),
                                                                result: None,
                                                                error: None,
                                                            },
                                                        );
                                                        tool_call_emitted.insert(index);
                                                    }
                                                }

                                                // Accumulate arguments
                                                if let Some(args_delta) = function
                                                    .get("arguments")
                                                    .and_then(|v| v.as_str())
                                                {
                                                    entry.1.push_str(args_delta);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        eprintln!("[AI Agent] Stream processing complete");

        // Execute all accumulated tool calls and prepare for next turn
        if !tool_calls.is_empty() {
            eprintln!(
                "[AI Agent] Continuing conversation with {} tool calls",
                tool_calls.len()
            );

            // Build assistant message with tool calls
            let tool_calls_json: Vec<Value> = tool_calls
                .iter()
                .map(|(index, (name, args_str))| {
                    json!({
                        "id": format!("call_{index}"),
                        "type": "function",
                        "function": {
                            "name": name,
                            "arguments": args_str
                        }
                    })
                })
                .collect();

            all_messages.push(json!({
                "role": "assistant",
                "content": null,
                "tool_calls": tool_calls_json
            }));

            // Execute tools and collect results
            for (index, (name, args_str)) in tool_calls.iter() {
                eprintln!("[AI Agent] Executing tool #{index}: {name} with args: {args_str}");

                let args: Value = if args_str.is_empty() {
                    json!({})
                } else {
                    serde_json::from_str(args_str).unwrap_or_else(|e| {
                        eprintln!("[AI Agent] Failed to parse tool arguments: {e}");
                        json!({})
                    })
                };

                match execute_tool(name, args, &app).await {
                    Ok(result) => {
                        eprintln!(
                            "[AI Agent] Tool result: {}",
                            &result[..result.len().min(100)]
                        );
                        let _ = app.emit(
                            "ai-stream",
                            StreamEvent {
                                event_type: "tool-result".to_string(),
                                content: None,
                                tool_name: Some(name.to_string()),
                                args: None,
                                result: Some(json!(result.clone())),
                                error: None,
                            },
                        );

                        // Add tool result message
                        all_messages.push(json!({
                            "role": "tool",
                            "tool_call_id": format!("call_{index}"),
                            "content": result
                        }));
                    }
                    Err(e) => {
                        eprintln!("[AI Agent] Tool error: {e}");
                        let _ = app.emit(
                            "ai-stream",
                            StreamEvent {
                                event_type: "error".to_string(),
                                content: None,
                                tool_name: None,
                                args: None,
                                result: None,
                                error: Some(format!("Tool execution failed: {e}")),
                            },
                        );

                        // Add error as tool result
                        all_messages.push(json!({
                            "role": "tool",
                            "tool_call_id": format!("call_{index}"),
                            "content": format!("Error: {e}")
                        }));
                    }
                }
            }

            // Continue loop to get AI's response to tool results
            continue;
        } else {
            // No tools used, conversation complete
            eprintln!("[AI Agent] No tool use detected, ending conversation");
            break;
        }
    } // End of loop

    // Send final done event
    let _ = app.emit(
        "ai-stream",
        StreamEvent {
            event_type: "done".to_string(),
            content: None,
            tool_name: None,
            args: None,
            result: None,
            error: None,
        },
    );

    eprintln!("[AI Agent] Query complete");
    Ok(())
}

/// Cancel ongoing AI stream
#[tauri::command]
pub async fn cancel_ai_stream(state: State<'_, AiAgentState>) -> Result<(), String> {
    eprintln!("[AI Agent] Cancelling stream");

    // Trigger cancellation token
    if let Some(token) = state.cancellation_token.lock().await.take() {
        token.cancel();
        eprintln!("[AI Agent] Cancellation token triggered");
    } else {
        eprintln!("[AI Agent] No active cancellation token found");
    }

    Ok(())
}
