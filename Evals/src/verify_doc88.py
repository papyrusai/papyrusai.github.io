import pandas as pd
import json
import os

def verify_doc88():
    """Verificar que Doc88 se añadió correctamente a ambos datasets."""
    
    print("VERIFICACIÓN DE DOC88")
    print("="*50)
    
    # Verificar dataset enhanced v2
    try:
        df_enhanced = pd.read_csv('data/Dataset_langsmith_enhanced_v2.csv')
        doc88_enhanced = df_enhanced[df_enhanced['input_question'].str.contains('Doc88:', na=False)]
        
        print(f"📊 Dataset Enhanced v2:")
        print(f"   Total filas: {len(df_enhanced)}")
        print(f"   Doc88 encontrado: {'✅ SÍ' if len(doc88_enhanced) > 0 else '❌ NO'}")
        
        if len(doc88_enhanced) > 0:
            content = doc88_enhanced.iloc[0]['input_question']
            output = doc88_enhanced.iloc[0]['output_output']
            print(f"   Longitud del texto: {len(content)} caracteres")
            print(f"   Primeros 100 caracteres: {content[:100]}...")
            
            # Verificar que el output es JSON válido
            try:
                output_json = json.loads(output)
                print(f"   Output JSON válido: ✅ SÍ")
                print(f"   Número de etiquetas: {len(output_json)}")
                for key in output_json.keys():
                    print(f"     - {key}")
            except:
                print(f"   Output JSON válido: ❌ NO")
        
    except Exception as e:
        print(f"❌ Error al verificar dataset enhanced v2: {e}")
    
    print()
    
    # Verificar dataset notion
    try:
        df_notion = pd.read_csv('data/Dataset_notion_1620_01_08.csv')
        doc88_notion = df_notion[df_notion['ID'] == 'Doc88']
        
        print(f"📋 Dataset Notion:")
        print(f"   Total filas: {len(df_notion)}")
        print(f"   Doc88 encontrado: {'✅ SÍ' if len(doc88_notion) > 0 else '❌ NO'}")
        
        if len(doc88_notion) > 0:
            row = doc88_notion.iloc[0]
            print(f"   ID: {row['ID']}")
            print(f"   Área: {row['Área']}")
            print(f"   Texto truncado: {row['Texto (primeros 75 caracteres)']}")
            
            # Verificar que el output es JSON válido
            try:
                output_json = json.loads(row['Output esperado'])
                print(f"   Output JSON válido: ✅ SÍ")
                print(f"   Número de etiquetas: {len(output_json)}")
            except:
                print(f"   Output JSON válido: ❌ NO")
        
    except Exception as e:
        print(f"❌ Error al verificar dataset notion: {e}")
    
    print("\n🎯 COMPARACIÓN CON DOC87:")
    print("="*30)
    
    # Comparar con Doc87 para consistencia
    try:
        doc87_enhanced = df_enhanced[df_enhanced['input_question'].str.contains('Doc87:', na=False)]
        doc87_notion = df_notion[df_notion['ID'] == 'Doc87']
        
        print(f"Doc87 en enhanced: {'✅' if len(doc87_enhanced) > 0 else '❌'}")
        print(f"Doc87 en notion: {'✅' if len(doc87_notion) > 0 else '❌'}")
        print(f"Doc88 en enhanced: {'✅' if len(doc88_enhanced) > 0 else '❌'}")
        print(f"Doc88 en notion: {'✅' if len(doc88_notion) > 0 else '❌'}")
        
    except Exception as e:
        print(f"Error en comparación: {e}")
    
    print("\n📈 ESTADÍSTICAS FINALES:")
    print("="*25)
    print(f"Dataset Enhanced v2: {len(df_enhanced)} filas")
    print(f"Dataset Notion: {len(df_notion)} filas")
    print("✅ Proceso completado exitosamente")

if __name__ == "__main__":
    # Cambiar al directorio Evals
    script_dir = os.path.dirname(os.path.abspath(__file__))
    evals_dir = os.path.dirname(script_dir)
    os.chdir(evals_dir)
    verify_doc88() 