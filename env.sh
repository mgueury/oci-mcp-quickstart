# env.sh

if [ -f $HOME/.oci_starter_profile ]; then
  . $HOME/.oci_starter_profile
else
  export TF_VAR_compartment_ocid="##TF_VAR_compartment_ocid##"
  export TF_VAR_region="##TF_VAR_region##"
  export TF_VAR_genai_meta_model="##TF_VAR_genai_meta_model##"
  export TF_VAR_genai_cohere_model="##TF_VAR_genai_cohere_model##"
fi