import axios from "axios";
import {
  LlmResponseStruct,
  GeminiChatCompletionParams,
  SuccessResponseDataFormat,
} from "./dto.js";

// Gemini API 
export async function GeminiProcessor(data: any): Promise<LlmResponseStruct> {
  try {
    // Parse and validate input parameters
    const params: GeminiChatCompletionParams = {
      input: '',
      images_arr: [],
      input_type: 'text',
      is_stream: false,

      prompt: '',
      api_key: '',

      chat_model: 'gemini-2.0-flash-lite',
      vision_model: 'gemini-pro-vision',
      speech_model: '',

      chat_history: [],
      tools: [],
      temperature: 0.1,

      max_tokens: 1000,
      forced_tool_calls: null,
      tool_choice: 'auto',
      ...data
    };

    let selected_model = params.chat_model;
    if (params.input_type === 'image') {
      selected_model = params.vision_model;
    }

    // Input validation
    if (!params.api_key) {
      return {
        Data: null,
        Error: new Error("Gemini API Key is required"),
        Status: false,
      };
    }

    if (!params.prompt && !params.input) {
      return {
        Data: null,
        Error: new Error("Prompt or input is required"),
        Status: false,
      };
    }
    
    const chatContents: any[] = [];

    // Add chat history if available
    for (const message of params.chat_history || []) {
      if (message.role === "user" || message.role === "model") {
        chatContents.push({
          role: message.role,
          parts: [{ text: message.content }]
        });
      }
    }

    // Add latest user message
    chatContents.push({
      role: "user",
      parts: [{ text: params.input }]
    });

    // Construct full payload
    const payload: any = {
      system_instruction: {
        parts: [
          {
            text: params.prompt 
          }
        ]
      },
      contents: chatContents,
      generationConfig: {
        temperature: params.temperature,
        maxOutputTokens: params.max_tokens
      }
    };

    if (params.tools && params.tools.length > 0) {
      payload.tools = [
        {
          functionDeclarations: params.tools.map((tool: any) => {
            // Clean the parameters to only include Gemini-compatible properties
            const cleanParameters: any = {
              type: "object",
              properties: {},
              required: []
            };

            if (tool.function.parameters) {
              // Only include basic properties that Gemini supports
              if (tool.function.parameters.properties) {
                cleanParameters.properties = {};
                Object.entries(tool.function.parameters.properties).forEach(([key, value]: [string, any]) => {
                  cleanParameters.properties[key] = {
                    type: value.type || "string",
                    description: value.description || ""
                  };
                  // Handle array types
                  if (value.type === "array" && value.items) {
                    cleanParameters.properties[key].items = {
                      type: value.items.type || "string"
                    };
                  }
                  // Handle enum types
                  if (value.enum) {
                    cleanParameters.properties[key].enum = value.enum;
                  }
                });
              }
              
              if (tool.function.parameters.required) {
                cleanParameters.required = tool.function.parameters.required;
              }
            }

            return {
              name: tool.function.name,
              description: tool.function.description,
              parameters: cleanParameters
            };
          })
        }
      ];
      
      // Force function calling for Gemini with correct configuration
      payload.toolConfig = {
        functionCallingConfig: {
          mode: "ANY",
          allowedFunctionNames: params.tools.map((tool: any) => tool.function.name)
        }
      };
    }

    // console.log("Gemini Request : ", JSON.stringify(payload));
    console.log("🔍 Gemini Request - Tools:", payload.tools ? payload.tools.length : 0);
    console.log("🔍 Gemini Request - Tool Config:", payload.toolConfig);
    if (payload.tools) {
      console.log("🔍 Gemini Request - Tool Schemas:", JSON.stringify(payload.tools[0].functionDeclarations, null, 2));
    }
    
    // Perform Gemini API call
    try {
      const response = await axios({
        method: 'post',
        url: `https://generativelanguage.googleapis.com/v1beta/models/${selected_model}:generateContent?key=${params.api_key}`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: payload,
        // timeout: 60000
      });
     
      // console.log("Gemini Response : ",JSON.stringify( response.data));
      console.log("🔍 Gemini Response - Parts:", response.data?.candidates?.[0]?.content?.parts?.length || 0);
      console.log("🔍 Gemini Response - Has Function Call:", response.data?.candidates?.[0]?.content?.parts?.some((p: any) => p.functionCall));
      console.log("🔍 Gemini Response - Full Response:", JSON.stringify(response.data, null, 2));

      const messageContent = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      const usage = response.data?.usageMetadata || {};

      var is_tool_call = false;
      var function_calls = [];
      
      // Check for function calls in the response
      const parts = response.data?.candidates?.[0]?.content?.parts || [];
      console.log("🔍 All parts:", parts);
      
      for (const part of parts) {
        if (part.functionCall) {
          is_tool_call = true;
          console.log("🔍 Found function call:", part.functionCall);
          function_calls.push({
            id: `call_${Date.now()}_${Math.random()}`,
            type: "function",
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {})
            }
          });
        }
      }

      console.log("🔍 Function calls found:", function_calls.length);

      // If we have function calls, format the response like OpenAI
      let final_response_data = response.data;
      if (is_tool_call && function_calls.length > 0) {
        final_response_data = {
          ...response.data,
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: messageContent || null,
              tool_calls: function_calls
            },
            finish_reason: "tool_calls"
          }]
        };
        console.log("🔍 Created OpenAI-compatible response with tool calls");
      }

      const final_response_format: SuccessResponseDataFormat = {
        total_llm_calls: 1,
        total_tokens: usage.totalTokenCount || 0,
        total_input_tokens: usage.promptTokenCount || 0,
        total_output_tokens: usage.candidatesTokenCount || 0,
        final_llm_response: final_response_data || {},
        llm_responses_arr: [final_response_data],
        messages: [messageContent],
        output_type:  is_tool_call ? "tool_call" : "text",
      };

      return {
        Data: final_response_format,
        Error: null,
        Status: true,
      };
    } catch (error: any) {
      return {
        Data: null,
        Error: error?.response?.data || error?.request || error?.message,
        Status: false,
      };
    }

  } catch (error) {
    console.error("Gemini Processing Error:", error);
    return {
      Data: null,
      Error: error instanceof Error ? error : new Error("Unexpected Error"),
      Status: false
    };
  }
}
