import pandas as pd
import json

def generate_summary():
    df = pd.read_csv('data/Dataset_notion_updated.csv')
    
    print('RESUMEN DEL CRUCE DE DATOS:')
    print('=' * 50)
    print(f'Total de filas en el dataset: {len(df)}')
    
    updated_count = 0
    not_updated_count = 0
    
    for _, row in df.iterrows():
        output = str(row['Output esperado'])
        # Verificar si el output parece ser JSON válido (actualizado)
        if output.startswith('{') and output.endswith('}'):
            try:
                json.loads(output)
                updated_count += 1
            except:
                # Si no es JSON válido, considerarlo como no actualizado
                not_updated_count += 1
        else:
            not_updated_count += 1
    
    print(f'Filas con output actualizado: {updated_count}')
    print(f'Filas sin actualizar: {not_updated_count}')
    print(f'Porcentaje actualizado: {updated_count/len(df)*100:.1f}%')
    
    # Mostrar algunos ejemplos de DocIDs actualizados
    print('\nEjemplos de DocIDs actualizados:')
    count = 0
    for _, row in df.iterrows():
        output = str(row['Output esperado'])
        if output.startswith('{') and count < 5:
            print(f"  {row['ID']}: ✓ Actualizado")
            count += 1
    
    # Mostrar algunos ejemplos de DocIDs no actualizados
    print('\nEjemplos de DocIDs NO actualizados:')
    count = 0
    for _, row in df.iterrows():
        output = str(row['Output esperado'])
        if not output.startswith('{') and count < 5:
            print(f"  {row['ID']}: ✗ No actualizado")
            count += 1

if __name__ == "__main__":
    import os
    script_dir = os.path.dirname(os.path.abspath(__file__))
    evals_dir = os.path.dirname(script_dir)
    os.chdir(evals_dir)
    generate_summary() 