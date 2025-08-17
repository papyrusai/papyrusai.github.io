import pandas as pd
import os

def verify_doc87():
    """Verificar que Doc87 se añadió correctamente a ambos datasets."""
    
    print("VERIFICACIÓN DE DOC87")
    print("="*50)
    
    # Verificar dataset enhanced v2
    try:
        df_enhanced = pd.read_csv('data/Dataset_langsmith_enhanced_v2.csv')
        doc87_enhanced = df_enhanced[df_enhanced['input_question'].str.contains('Doc87:', na=False)]
        
        print(f"📊 Dataset Enhanced v2:")
        print(f"   Total filas: {len(df_enhanced)}")
        print(f"   Doc87 encontrado: {'✅ SÍ' if len(doc87_enhanced) > 0 else '❌ NO'}")
        
        if len(doc87_enhanced) > 0:
            content = doc87_enhanced.iloc[0]['input_question']
            print(f"   Longitud del texto: {len(content)} caracteres")
            print(f"   Primeros 100 chars: {content[:100]}...")
            
    except Exception as e:
        print(f"❌ Error al verificar dataset enhanced: {e}")
    
    # Verificar dataset de Notion
    try:
        df_notion = pd.read_csv('data/Dataset_notion_1620_01_08.csv')
        doc87_notion = df_notion[df_notion['ID'] == 'Doc87']
        
        print(f"\n📋 Dataset de Notion:")
        print(f"   Total filas: {len(df_notion)}")
        print(f"   Doc87 encontrado: {'✅ SÍ' if len(doc87_notion) > 0 else '❌ NO'}")
        
        if len(doc87_notion) > 0:
            row = doc87_notion.iloc[0]
            print(f"   Área: {row['Área']}")
            print(f"   Texto truncado: {row['Texto (primeros 75 caracteres)']}")
            print(f"   Output esperado (primeros 150 chars): {str(row['Output esperado'])[:150]}...")
            
    except Exception as e:
        print(f"❌ Error al verificar dataset de Notion: {e}")
    
    print(f"\n✅ Verificación completada")

if __name__ == "__main__":
    # Cambiar al directorio Evals
    script_dir = os.path.dirname(os.path.abspath(__file__))
    evals_dir = os.path.dirname(script_dir)
    os.chdir(evals_dir)
    verify_doc87() 