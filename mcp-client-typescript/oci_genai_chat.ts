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
  client.region = env.TF_VAR_region;
  client.endpoint = "https://inference.generativeai."+client.region+".oci.oraclecloud.com";

  // On Demand Serving Mode
  const servingMode: models.OnDemandServingMode = {
      modelId: process.env.TF_VAR_genai_cohere_model,
      servingType: "ON_DEMAND",
  };

  // Chat Details
  const chatRequest: requests.ChatRequest = {
    chatDetails: {
      compartmentId: process.env.TF_VAR_compartment_ocid,
      servingMode: servingMode,
      chatRequest: {
        message: "Tell a joke",
        apiFormat: "COHERE",
        maxTokens: 600,
        temperature: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        topK: 0,
        topP: 0.75,
      }
    },
    retryConfiguration: NoRetryConfigurationDetails
  };

  const chatResponse = await client.chat(chatRequest);

  // Print chat response
  console.log("**************************Chat Response**************************");
  console.log(JSON.stringify(chatResponse));

})();

