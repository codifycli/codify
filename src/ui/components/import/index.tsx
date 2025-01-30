import { Form, FormProps } from '@codifycli/ink-form';
import React from 'react';

import { RequiredParameters } from '../../../orchestrators/import.js';

export function ImportParametersForm(
  props: { requiredParameters: RequiredParameters, onSubmit?: (result: object) => void }
) {
  const { requiredParameters, onSubmit } = props;

  const form: FormProps = {
    form: {
      title: 'codify import',
      description: 'some parameters are required to continue import',
      sections: [...requiredParameters.entries()].map(([resourceName, v]) => ({
        title: resourceName,
        fields: v.map((resourceParameters) => ({
          type: resourceParameters.type,
          name: resourceParameters.name,
          label: resourceParameters.name,
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
