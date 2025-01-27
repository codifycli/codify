import { Form, FormProps } from 'ink-form';
import React from 'react';

import { RequiredParameters } from '../../../orchestrators/import.js';

export function ImportParametersForm(
  props: { requiredParameters: RequiredParameters, onSubmit?: (result: object) => void }
) {
  const { requiredParameters, onSubmit } = props;

  const form: FormProps = {
    form: {
      title: 'Import: Additional information is required for the following resources',
      sections: [...requiredParameters.entries()].map(([resourceName, v]) => ({
        title: `${resourceName}`,
        description: `Specify the following parameters for '${resourceName}'`,
        fields: v.map((resourceParameters) => ({
          type: resourceParameters.type,
          name: `${resourceName}.${resourceParameters.name}`,
          label: `'${resourceParameters.name}' parameter value`,
          required: true,
        })),
      })),
    },
  }
  
  return <Form
    { ...form }
    onSubmit={ onSubmit }
  />
}
