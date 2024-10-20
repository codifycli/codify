import { Form, FormProps } from 'ink-form';
import React from 'react';

import { RequiredProperties } from '../../../orchestrators/import.js';

export function ImportParametersForm(
  props: { requiredProperties: RequiredProperties, onSubmit?: (result: object) => void }
) {
  const { requiredProperties, onSubmit } = props;

  const form: FormProps = {
    form: {
      title: 'Import: Additional information is required',
      sections: [...requiredProperties.entries()].map(([resourceName, v]) => ({
        title: `${resourceName} resource`,
        description: `Specify the following parameters for '${resourceName}'`,
        fields: v.map((resourceProperties) => ({
          type: resourceProperties.propertyType,
          name: `${resourceName}.${resourceProperties.propertyName}`,
          label: `'${resourceProperties.propertyName}' parameter value`,
          required: true,
        })),
      }))
    }
  }
  
  return <Form
    { ...form }
    onSubmit={ onSubmit }
  />
}
