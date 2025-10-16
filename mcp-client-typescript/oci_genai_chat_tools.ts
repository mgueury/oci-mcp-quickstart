/* coding: utf-8
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * This software is dual-licensed to you under the
 * Universal Permissive License (UPL) 1.0 as shown at https://oss.oracle.com/licenses/upl or
 * Apache License 2.0 as shown at http://www.apache.org/licenses/LICENSE-2.0.
 * You may choose either license.
 *************************************************************************
 * generative-ai-chat.ts
 * Supports Node.js >= 18
 **************************************************************************
 * Install using yarn or npm
 * yarn add tsx oci-common oci-generativeaiinference
 * OR
 * npm install tsx oci-common oci-generativeaiinference
 *************************************************************************
 * Info: Get response for the given conversation with Chat Models using OCI Generative AI Service.
 *************************************************************************
 * To run a single TypeScript file without compiling the whole project
 * npx tsx generative-ai-chat.ts
 *************************************************************************
 */

import { GenerativeAiInferenceClient, models, requests } from "oci-generativeaiinference";
import {
  InstancePrincipalsAuthenticationDetailsProviderBuilder,
  NoRetryConfigurationDetails
} from "oci-common";
import { env } from "process";

(async () => {
  // Configuring the AuthenticationDetailsProvider. It's assuming there is a default OCI config file "~/.oci/config", and
  // a profile in that config with the name defined in CONFIG_PROFILE variable.
  const provider = await new InstancePrincipalsAuthenticationDetailsProviderBuilder().build();

  const client = new GenerativeAiInferenceClient({
      authenticationDetailsProvider: provider,
    }
  );

  // Sets the endpoint of the service.
  // client.region = env.TF_VAR_region;
  client.endpoint = "https://inference.generativeai."+env.TF_VAR_region+".oci.oraclecloud.com";

  // On Demand Serving Mode
  const servingMode: models.OnDemandServingMode = {
      modelId: env.TF_VAR_genai_cohere_model,
      servingType: "ON_DEMAND",
  };

  // Chat Details
  const chatRequest: requests.ChatRequest = {
    chatDetails: {
      compartmentId: env.TF_VAR_compartment_ocid,
      servingMode: servingMode,
      chatRequest: {
        message: "Add 2 and 3",
        apiFormat: "COHERE",
        maxTokens: 600,
        temperature: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        topK: 0,
        topP: 0.75,
        tools: [ 
            {
                description: "add 2 numbers",
                name: "add",
                parameterDefinitions: {
                    num1: {
                        description: "number 1",
                        type: "string",
                        isRequired: true
                    },
                    num2: {
                        description: "number 1",
                        type: "string",
                        isRequired: true
                    }
                }
            }
        ]
      }
    },
    retryConfiguration: NoRetryConfigurationDetails
  };

  const chatResponse = await client.chat(chatRequest);

  // Print chat response
  console.log(JSON.stringify(chatResponse, null, 2));

})();

/* 
Sample response

{
  "chatResult": {
    "modelId": "cohere.command-a-03-2025",
    "modelVersion": "1.0",
    "chatResponse": {
      "apiFormat": "COHERE",
      "text": "I will add 2 and 3 using the add tool.",
      "chatHistory": [
        {
          "role": "USER",
          "message": "Add 2 and 3"
        },
        {
          "role": "CHATBOT",
          "message": "I will add 2 and 3 using the add tool.",
          "toolCalls": [
            {
              "name": "add",
              "parameters": {
                "num1": "2",
                "num2": "3"
              }
            }
          ]
        }
      ],
      "finishReason": "COMPLETE",
      "toolCalls": [
        {
          "name": "add",
          "parameters": {
            "num1": "2",
            "num2": "3"
          }
        }
      ],
      "usage": {
        "completionTokens": 25,
        "promptTokens": 19,
        "totalTokens": 44
      }
    }
  },
  "opcRequestId": "1694F401AAD2-11F0-B6EE-317F28C66/63EDDCD4F7DC14F19C4286798F91B416/3F0748FA8C3B59BA1A0BEEA50F0B01D3"
}
*/
