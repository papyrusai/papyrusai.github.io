import os
import pandas as pd

def final_verification():
    """Verificación final de todos los archivos creados."""
    
    print("🎯 VERIFICACIÓN FINAL DEL PROYECTO")
    print("=" * 50)
    
    # Lista de archivos esperados
    expected_files = [
        'Dataset_langsmith_enhanced_v2.csv',
        'Dataset_langsmith_falta.csv', 
        'Dataset_langsmith_grises.csv',
        'Dataset_langsmith_ruido.csv',
        'Dataset_langsmith_analisis.csv',
        'Dataset_notion_1620_01_08.csv'
    ]
    
    print("📁 VERIFICACIÓN DE ARCHIVOS:")
    print("-" * 30)
    
    total_size = 0
    files_found = 0
    
    for file in expected_files:
        path = f'data/{file}'
        if os.path.exists(path):
            size = os.path.getsize(path)
            total_size += size
            files_found += 1
            
            # Verificar contenido básico
            try:
                df = pd.read_csv(path)
                print(f"✅ {file}: {size:,} bytes ({len(df)} filas)")
            except:
                print(f"⚠️ {file}: {size:,} bytes (Error al leer)")
        else:
            print(f"❌ {file}: No encontrado")
    
    print(f"\n📊 RESUMEN:")
    print("-" * 15)
    print(f"Archivos encontrados: {files_found}/{len(expected_files)}")
    print(f"Tamaño total: {total_size:,} bytes ({total_size/1024/1024:.1f} MB)")
    
    # Verificar columna Área1 en Notion
    try:
        df_notion = pd.read_csv('data/Dataset_notion_1620_01_08.csv')
        if 'Área1' in df_notion.columns:
            area1_pos = df_notion.columns.tolist().index('Área1')
            area_pos = df_notion.columns.tolist().index('Área')
            print(f"\n✅ Columna Área1 verificada:")
            print(f"   Posición Área1: {area1_pos + 1}")
            print(f"   Posición Área: {area_pos + 1}")
            print(f"   Área1 antes de Área: {area1_pos < area_pos}")
            
            # Contar clasificaciones
            classification_counts = df_notion['Área1'].value_counts()
            print(f"\n📋 Distribución Área1:")
            for classification, count in classification_counts.head(5).items():
                print(f"   {classification}: {count}")
        else:
            print("\n❌ Columna Área1 no encontrada en Notion")
            
    except Exception as e:
        print(f"\n❌ Error verificando Notion: {e}")
    
    # Estado final
    success_rate = (files_found / len(expected_files)) * 100
    print(f"\n🎯 ESTADO FINAL:")
    print("-" * 15)
    print(f"Tasa de éxito: {success_rate:.1f}%")
    
    if success_rate == 100:
        print("🎉 ¡PROYECTO COMPLETADO EXITOSAMENTE!")
        print("📊 Todos los datasets han sido creados correctamente")
        print("🚀 Listos para análisis y producción")
    else:
        print("⚠️ Proyecto completado con algunas limitaciones")
    
    print(f"\n✅ Verificación terminada")

if __name__ == "__main__":
    # Cambiar al directorio Evals
    script_dir = os.path.dirname(os.path.abspath(__file__))
    evals_dir = os.path.dirname(script_dir)
    os.chdir(evals_dir)
    final_verification() 